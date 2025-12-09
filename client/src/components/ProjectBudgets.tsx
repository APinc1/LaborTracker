import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calculator, ExternalLink } from "lucide-react";

export default function ProjectBudgets() {
  const [, setLocation] = useLocation();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");

  const { data: projects = [], isLoading: projectsLoading } = useQuery<any[]>({
    queryKey: ["/api/projects"],
  });

  const activeProjects = (projects as any[])
    .filter((project: any) => !project.isInactive)
    .sort((a: any, b: any) => a.name.localeCompare(b.name));

  const selectedProject = activeProjects.find((p: any) => p.id.toString() === selectedProjectId);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Project Budgets</h1>
          <p className="text-gray-600">Manage master budgets for each project</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Select Project
          </CardTitle>
        </CardHeader>
        <CardContent>
          {projectsLoading ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : (
            <div className="flex items-center gap-4">
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
              >
                <SelectTrigger className="w-full max-w-md" data-testid="select-project">
                  <SelectValue placeholder="Choose a project..." />
                </SelectTrigger>
                <SelectContent>
                  {activeProjects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {selectedProject && (
                <Button
                  onClick={() => setLocation(`/projects/${selectedProjectId}?tab=budget`)}
                  data-testid="button-view-budget"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Master Budget
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedProject && (
        <Card>
          <CardContent className="py-6">
            <div className="text-center">
              <p className="text-gray-600 mb-4">
                Selected: <span className="font-semibold">{selectedProject.name}</span>
              </p>
              <Button
                size="lg"
                onClick={() => setLocation(`/projects/${selectedProjectId}?tab=budget`)}
                data-testid="button-open-budget"
              >
                <Calculator className="w-5 h-5 mr-2" />
                Open Master Budget
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
