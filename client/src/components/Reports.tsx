import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function Reports() {
  return (
    <div className="flex flex-col h-full">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-800">Reports</h1>
        <p className="text-gray-600 text-sm mt-1">Generate and view project reports</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <main className="p-6">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Reports Coming Soon
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  This section will contain various reports for your construction projects, including:
                </p>
                <ul className="list-disc list-inside mt-4 space-y-2 text-gray-600">
                  <li>Project Progress Reports</li>
                  <li>Budget vs Actual Reports</li>
                  <li>Employee Hours Summary</li>
                  <li>Location Status Reports</li>
                  <li>Daily Activity Summaries</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
