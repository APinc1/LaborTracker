import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, ClipboardList } from "lucide-react";

export default function DailyJobReports() {
  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-4">
        <Link href="/">
          <span className="flex items-center hover:text-gray-900 cursor-pointer">
            <Home className="w-4 h-4" />
          </span>
        </Link>
        <span>/</span>
        <span className="flex items-center gap-1 font-medium text-gray-900">
          <ClipboardList className="w-4 h-4" />
          Daily Job Reports
        </span>
      </nav>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Daily Job Reports</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            Reports
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">Daily Job Reports coming soon</p>
            <p className="text-sm text-gray-400 mt-2">
              This feature will allow you to create and manage daily job reports for your projects
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
