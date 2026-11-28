import { Building2, FileCheck, CircleDollarSign, ChartColumn, Landmark, Boxes } from 'lucide-react';
import { InternalPortalLayout } from '../../components/layout/InternalPortalLayout';
import './operations.css';
import '../../styles/workspace-theme.css';
import '../../styles/manager-workspace.css';
const navigation=[
 {to:'/operations',label:'Tổng quan kinh doanh',icon:Landmark,end:true,group:'Tổng quan'},
 {to:'/operations/facilities',label:'Cơ sở',icon:Building2,group:'Quản lý kinh doanh'},
 {to:'/operations/policies',label:'Chính sách kinh doanh',icon:FileCheck,group:'Quản lý kinh doanh'},
 {to:'/operations/pricing',label:'Khung giá',icon:CircleDollarSign,group:'Quản lý kinh doanh'},
 {to:'/operations/catalog',label:'Danh mục bổ trợ',icon:Boxes,group:'Quản lý kinh doanh'},
 {to:'/operations/reports',label:'Doanh thu và hiệu quả cơ sở',icon:ChartColumn,group:'Báo cáo'},
];
export function OperationsLayout(){return <InternalPortalLayout label="Điều hành kinh doanh" navigation={navigation} themed/>;}
