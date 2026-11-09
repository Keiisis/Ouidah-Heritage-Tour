import DocumentSite from "@/components/ui/DocumentSite";
export { metadata } from "@/components/ui/DocumentSite";

export default function Layout({ children }: LayoutProps<"/">) {
  return <DocumentSite langue="FR">{children}</DocumentSite>;
}
