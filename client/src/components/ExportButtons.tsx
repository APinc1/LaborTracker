import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { exportToPDF, exportToExcel } from "@/lib/exports";

export default function ExportButtons() {
  const handleExportPDF = () => {
    exportToPDF();
  };

  const handleExportExcel = () => {
    exportToExcel();
  };

  return (
    <>
    </>
  );
}
