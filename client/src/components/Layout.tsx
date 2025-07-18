import { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface LayoutProps {
  children: ReactNode;
  onLogout?: () => void;
  user?: any;
}

export default function Layout({ children, onLogout, user }: LayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar onLogout={onLogout} user={user} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
