import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Lock, AlertCircle, CheckCircle } from "lucide-react";

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
  confirmPassword: z.string().min(6, "Password confirmation is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

interface ChangePasswordProps {
  user: any;
  onPasswordChanged: () => void;
  isFirstLogin?: boolean;
}

export default function ChangePassword({ user, onPasswordChanged, isFirstLogin = false }: ChangePasswordProps) {
  const { toast } = useToast();

  const form = useForm({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      console.log('Changing password for user:', user);
      console.log('User ID:', user?.id);
      
      if (!user || !user.id) {
        throw new Error('User information is missing. Please try logging in again.');
      }
      
      const requestData = {
        userId: user.id,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      };
      
      console.log('Password change request data:', { ...requestData, currentPassword: '***', newPassword: '***' });
      
      const response = await apiRequest('POST', '/api/auth/change-password', requestData);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your password has been changed successfully.",
      });
      onPasswordChanged();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to change password. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
    changePasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Set Your Password</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center space-x-2 text-amber-800">
              <AlertCircle className="w-5 h-5" />
              <p className="text-sm">
                For security, you must change your password from the default before accessing the system.
              </p>
            </div>
          </div>

          <div className="mb-4 text-center">
            <Button
              variant="ghost"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Back to Login
            </Button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Current Password 
                      {isFirstLogin && <span className="text-sm text-gray-500 ml-1">(AccessPacific2835)</span>}
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your current password" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Enter your new password" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input 
                        type="password" 
                        placeholder="Confirm your new password" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Your password should be at least 6 characters long and contain a mix of letters, numbers, and symbols for security.
                </AlertDescription>
              </Alert>

              <Button 
                type="submit" 
                className="w-full" 
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? 'Changing Password...' : 'Change Password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}