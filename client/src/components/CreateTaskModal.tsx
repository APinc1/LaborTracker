import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, MapPin, Tag, User, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTaskSchema } from "@shared/schema";

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate?: string;
  selectedProject?: number;
  selectedLocation?: number;
}

export default function CreateTaskModal({ 
  isOpen, 
  onClose, 
  selectedDate, 
  selectedProject, 
  selectedLocation 
}: CreateTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

  const { data: projects = [] } = useQuery({
    queryKey: ["/api/projects"],
    staleTime: 30000,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject || 0, "locations"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["/api/employees"],
    staleTime: 30000,
  });

  const { data: budgetItems = [] } = useQuery({
    queryKey: ["/api/projects", selectedProject || 0, "budget"],
    enabled: !!selectedProject,
    staleTime: 30000,
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/locations/${data.locationId}/tasks`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Success", description: "Task created successfully" });
      onClose();
      form.reset();
      setStep(1);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create task", variant: "destructive" });
    },
  });

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      taskId: '',
      locationId: selectedLocation || 0,
      taskType: '',
      name: '',
      taskDate: selectedDate || new Date().toISOString().split('T')[0],
      startDate: selectedDate || new Date().toISOString().split('T')[0],
      finishDate: selectedDate || new Date().toISOString().split('T')[0],
      costCode: '',
      superintendentId: null,
      foremanId: null,
      scheduledHours: '',
      actualHours: null,
      startTime: '08:00',
      finishTime: '17:00',
      workDescription: '',
      notes: '',
    },
  });

  const onSubmit = (data: any) => {
    const processedData = {
      ...data,
      taskId: `${data.locationId}_${data.name.replace(/\s+/g, '_')}`,
      locationId: parseInt(data.locationId),
      superintendentId: data.superintendentId ? parseInt(data.superintendentId) : null,
      foremanId: data.foremanId ? parseInt(data.foremanId) : null,
      scheduledHours: data.scheduledHours ? parseFloat(data.scheduledHours) : null,
      actualHours: data.actualHours ? parseFloat(data.actualHours) : null,
    };

    createTaskMutation.mutate(processedData);
  };

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    onClose();
    form.reset();
    setStep(1);
  };

  const getProject = (projectId: number) => {
    return projects.find((p: any) => p.id === projectId);
  };

  const getLocation = (locationId: number) => {
    return locations.find((l: any) => l.id === locationId);
  };

  const getForemen = () => {
    return employees.filter((emp: any) => emp.isForeman);
  };

  const getCostCodes = () => {
    return [...new Set(budgetItems.map((item: any) => item.costCode))];
  };

  const estimateHours = (costCode: string) => {
    const budgetItem = budgetItems.find((item: any) => item.costCode === costCode);
    return budgetItem?.hours || 40;
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>Create New Task</span>
            <span className="text-sm text-gray-500">({step}/3)</span>
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Basic Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="locationId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select location" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {locations.map((location: any) => (
                              <SelectItem key={location.id} value={location.id.toString()}>
                                {location.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="taskType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select task type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Form">Form</SelectItem>
                            <SelectItem value="Pour">Pour</SelectItem>
                            <SelectItem value="Demo/Ex">Demo/Ex</SelectItem>
                            <SelectItem value="Asphalt">Asphalt</SelectItem>
                            <SelectItem value="Grade">Grade</SelectItem>
                            <SelectItem value="Haul">Haul</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Form Day 1 of 3" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="costCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost Code</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select cost code" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {getCostCodes().map((code) => (
                              <SelectItem key={code} value={code}>
                                {code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="scheduledHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Scheduled Hours</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            step="0.5" 
                            min="0" 
                            max="80" 
                            placeholder="40" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Schedule & Timing</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="taskDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="finishDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Finish Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="finishTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Finish Time</FormLabel>
                        <FormControl>
                          <Input type="time" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="foremanId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Foreman</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select foreman" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="">No foreman assigned</SelectItem>
                          {getForemen().map((foreman: any) => (
                            <SelectItem key={foreman.id} value={foreman.id.toString()}>
                              {foreman.name} ({foreman.teamMemberId})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Description & Notes</h3>
                
                <FormField
                  control={form.control}
                  name="workDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Work Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe the work to be performed..."
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Any additional notes or special instructions..."
                          className="min-h-[100px]"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Task Summary */}
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium mb-2">Task Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <Tag className="w-4 h-4 text-gray-500" />
                      <span>{form.watch('name') || 'Task Name'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span>{getLocation(parseInt(form.watch('locationId')))?.name || 'Location'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span>{form.watch('taskDate') || 'Date'}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{form.watch('startTime')} - {form.watch('finishTime')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <div>
                {step > 1 && (
                  <Button type="button" variant="outline" onClick={handleBack}>
                    Back
                  </Button>
                )}
              </div>
              <div className="flex space-x-2">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                {step < 3 ? (
                  <Button type="button" onClick={handleNext}>
                    Next
                  </Button>
                ) : (
                  <Button type="submit" disabled={createTaskMutation.isPending}>
                    {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                  </Button>
                )}
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
