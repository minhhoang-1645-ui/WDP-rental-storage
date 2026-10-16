import { Redirect, type Href } from 'expo-router';
export default function Screen() { return <Redirect href={"/customer/invoices" as Href} />; }
