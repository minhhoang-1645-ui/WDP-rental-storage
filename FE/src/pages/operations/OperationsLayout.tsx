import { Building2, FileCheck, CircleDollarSign, ChartColumn } from 'lucide-react';
import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout';
import './operations.css';
const navigation=[
 {to:'/operations/facilities',label:'Cơ sở',icon:Building2},
 {to:'/operations/policies',label:'Chính sách thuê',icon:FileCheck},
 {to:'/operations/pricing',label:'Khung giá',icon:CircleDollarSign},
 {to:'/operations/reports',label:'Báo cáo toàn hệ thống',icon:ChartColumn},
];
export function OperationsLayout(){return <InternalPortalLayout label="Điều hành kinh doanh" navigation={navigation} themed/>;}
