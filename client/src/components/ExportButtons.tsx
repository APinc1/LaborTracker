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
      <Button
        variant="outline"
        onClick={handleExportPDF}
        className="flex items-center space-x-2"
      >
        <FileText className="w-4 h-4 text-red-500" />
        <span>Export PDF</span>
      </Button>
      <Button
        variant="outline"
        onClick={handleExportExcel}
        className="flex items-center space-x-2"
      >
        <Download className="w-4 h-4 text-green-600" />
        <span>Export Excel</span>
      </Button>
    </>
  );
}
