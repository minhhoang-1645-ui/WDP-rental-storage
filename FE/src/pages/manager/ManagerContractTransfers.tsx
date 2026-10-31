import { ContractRenewalHistory } from '../../components/customer/ContractRenewalHistory';
import { useAuth } from '../../auth/auth-context';
import { ContractTransferHistory } from '../../components/customer/ContractTransferHistory';
import type { Row } from '../../components/manager/portal-data';

export function ManagerContractTransfers({ contract }: { contract: Row; identity: string }) {
  const { user } = useAuth();
  const scope = user?.role === 'STAFF' ? 'staff/management' : 'manager';
  return <><ContractTransferHistory contract={contract} scope={scope} /><ContractRenewalHistory contract={contract} scope={scope} /></>;
}
