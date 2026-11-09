import { Suspense } from "react";
import { EcranServices } from "@/components/services/EcranServices";
export const metadata={robots:{index:false,follow:false}};
export default function Page(){return <Suspense fallback={null}><EcranServices admin/></Suspense>;}
