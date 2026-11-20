import { useSearchParams } from 'react-router-dom';
import { TransferAddenda } from '../../components/customer/TransferAddenda';
import { CustomerSupportPage } from './CustomerSupportPage';

export function CustomerTransfersPage() {
  const [params] = useSearchParams();
  if (params.get('transfer')) return <TransferAddenda />;
  if (params.get('request')) return <CustomerSupportPage transferOnly />;
  return <><TransferAddenda /><CustomerSupportPage transferOnly /></>;
}
