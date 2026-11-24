import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { catchError, concatMap, from, mergeMap, throwError } from 'rxjs';
import { AuditService, disabledLoginAction, type AuditInput } from './audit.service.js';
import { AccountDisabledException } from '../auth/auth.errors.js';
import type { PublicUser } from '../auth/auth.types.js';

const resources = new Set(['facilities', 'facility-access', 'business-rules', 'pricing-rules', 'damage-claims', 'business-policies', 'users', 'storage-types', 'units', 'reservations', 'contracts', 'renewals', 'appointments', 'maintenance', 'returns', 'early-return-requests', 'transfers', 'stock-movements', 'stored-items', 'additional-services', 'payments', 'invoices', 'payment-submissions', 'online-payment-reconciliations', 'support-requests', 'deposit-settlements', 'unit-staff', 'staff-assignments', 'inquiries']);
type AuditRequest = { method: string; route?: { path?: unknown }; params?: Record<string, string>; body?: Record<string, unknown>; user?: PublicUser; ip?: string; socket?: { remoteAddress?: string } };

/** Server-owned route templates + explicit fields only; never serialize request/result bodies. */
export function auditTarget(request: AuditRequest): Pick<AuditInput, 'category' | 'action' | 'resource' | 'route'> | undefined {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) || typeof request.route?.path !== 'string') return;
  const route = request.route.path.replace(/^\/api(?=\/)/, '');
  if (/^\/auth\/(login|logout|register)$/.test(route) || route === '/auth/me' && request.method === 'PATCH') {
    const action = route.split('/').at(-1)!;
    return { category: action === 'login' || action === 'logout' ? 'LOGIN' : 'ACTIVITY', action: action === 'me' ? 'AUTH_PROFILE_UPDATE' : `AUTH_${action.toUpperCase()}`, resource: 'auth', route };
  }
  if (!request.user) return;
  if (request.method === 'POST' && route === '/customer/booking-requests/:bookingCode/claim') {
    return { category: 'ACTIVITY', action: 'CLAIM', resource: 'booking-requests', route };
  }
  if (request.method === 'POST' && route === '/customer/transfer-orders/:id/accept') {
    return { category: 'ACTIVITY', action: 'ACCEPT', resource: 'transfer-orders', route };
  }
  const adminAccessAction = request.method === 'POST' && route === '/admin/facility-access' ? 'GRANT_FACILITY_ACCESS'
    : request.method === 'PATCH' && route === '/admin/facility-access/:id/revoke' ? 'REVOKE_FACILITY_ACCESS'
    : request.method === 'PATCH' && route === '/admin/facility-access/users/:id/role' ? 'CHANGE_ROLE'
    : request.method === 'PATCH' && route === '/admin/users/:id/sessions/revoke' ? 'REVOKE_SESSIONS' : undefined;
  if (adminAccessAction) return {
    category: 'ACTIVITY', action: adminAccessAction,
    resource: adminAccessAction === 'REVOKE_FACILITY_ACCESS' ? 'facility-access' : 'users', route,
  };
  const segments = route.replace(/^\/(?:customer|manager|admin|staff|operations)(?:\/management)?(?=\/)/, '').split('/').filter(Boolean);
  const resource = segments[0];
  if (!resources.has(resource)) return;
  const suffix = segments.at(-1)!;
  const action = segments.length > 2 && !suffix.startsWith(':') ? suffix.replace(/-/g, '_').toUpperCase() : ({ POST: 'CREATE', PATCH: 'UPDATE', PUT: 'UPDATE', DELETE: 'DELETE' }[request.method]!);
  return { category: 'ACTIVITY', action, resource, route };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp(), request = http.getRequest<AuditRequest>();
    const target = auditTarget(request);
    if (!target) return next.handle();
    const record = async (status: number, result?: unknown, error?: unknown) => {
      // Successful IAM writes record their audit event inside the mutation transaction.
      if (status < 400 && ['GRANT_FACILITY_ACCESS', 'REVOKE_FACILITY_ACCESS', 'CHANGE_ROLE', 'REVOKE_SESSIONS'].includes(target.action)) return;
      const data = result && typeof result === 'object' ? result as { user?: PublicUser; id?: unknown; accountStatus?: unknown; statusChanged?: unknown } : undefined;
      const auth = target.resource === 'auth';
      const disabledLogin = target.action === 'AUTH_LOGIN' && error instanceof AccountDisabledException ? error : undefined;
      let action = disabledLogin ? disabledLoginAction : target.action;
      if (status < 400 && target.resource === 'users' && target.action === 'STATUS' && request.method === 'PATCH') {
        if (data?.statusChanged === false) action = 'ACCOUNT_STATUS_UNCHANGED';
        if (data?.statusChanged === true && data.accountStatus === 'DISABLED') action = 'DISABLE_ACCOUNT';
        if (data?.statusChanged === true && data.accountStatus === 'ACTIVE') action = 'REACTIVATE_ACCOUNT';
      }
      const resourceId = ['id', 'invoiceId', 'contractId', 'reservationId', 'renewalId', 'transferId', 'unitId', 'requestId', 'returnId', 'submissionId', 'bookingCode'].map(key => request.params?.[key]).find(value => typeof value === 'string') ?? data?.id;
      return this.audit.record({ ...target, action, method: request.method, httpStatus: status,
        actor: disabledLogin?.verifiedAccount ?? request.user ?? (auth && status < 400 ? data?.user : undefined),
        attemptedEmail: auth && target.action !== 'AUTH_LOGOUT' ? request.body?.email : undefined,
        resourceId: auth ? undefined : resourceId,
        ipAddress: request.socket?.remoteAddress ?? request.ip,
      });
    };
    return next.handle().pipe(
      concatMap(async result => { await record(http.getResponse<{ statusCode: number }>().statusCode, result); return result; }),
      catchError((error: unknown) => {
        const status = error && typeof error === 'object' && 'getStatus' in error && typeof error.getStatus === 'function' ? Number(error.getStatus()) : 500;
        return from(record(status, undefined, error)).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}
