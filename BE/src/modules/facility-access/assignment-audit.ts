import type { Prisma } from '../../generated/prisma/client.js';
import type { PublicUser } from '../auth/auth.types.js';
/** Written with the task transaction: a failed reassignment leaves neither a changed task nor a false audit entry. */
export async function recordAssignment(db:Prisma.TransactionClient,actor:PublicUser,resource:string,id:string,previous:string|null|undefined,next:string|null,detail?:Prisma.InputJsonObject) {
 if((previous??null)===next)return;
 await db.auditEvent.create({data:{category:'ACTIVITY',action:'TASK_ASSIGNMENT',outcome:'SUCCESS',
 actorId:actor.id,actorRole:actor.role,actorName:actor.fullName,actorEmail:actor.email,resource,resourceId:id,
 method:'PATCH',route:'/'+resource+'/'+id+'/assignment',httpStatus:200,
 metadata:{...detail,previousStaffUserId:previous??null,assignedStaffUserId:next}}});
}
