"use client";

import { 
  LayoutDashboard, 
  Network, 
  Search, 
  Users, 
  FileText, 
  Waypoints, 
  BarChart2, 
  Settings 
} from "lucide-react";

export default function MainSidebar() {
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", active: false },
    { icon: Network, label: "Graph", active: true },
    { icon: Search, label: "Search", active: false },
    { icon: Users, label: "Entities", active: false },
    { icon: FileText, label: "Episodes", active: false },
    { icon: Waypoints, label: "Relationships", active: false },
    { icon: BarChart2, label: "Analytics", active: false },
  ];

  return (
    <div className="w-16 bg-[#0F172A] border-r border-[#334155] flex flex-col items-center py-6 h-full flex-shrink-0 z-30">
      
      {/* Brand Icon (Logo Placeholder) */}
      <div className="mb-8">
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-md cursor-pointer hover:bg-blue-700 transition-colors">
           <Network className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Navigation Icons */}
      <div className="flex-1 flex flex-col gap-4 w-full px-2">
        {menuItems.map((item) => (
          <button
            key={item.label}
            title={item.label} // Tooltip shows label on hover
            className={`w-full flex justify-center p-3 rounded-xl transition-all duration-200 group relative ${
              item.active
                ? "bg-blue-600 text-white shadow-lg"
                : "text-gray-400 hover:bg-slate-700 hover:text-white"
            }`}
          >
            <item.icon className="w-6 h-6" />
            
            {/* Hover Dot Indicator (Optional polish) */}
            {!item.active && (
              <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1 h-1 bg-slate-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        ))}
      </div>

      {/* Bottom Settings */}
      <div className="mt-auto w-full px-2 pb-4">
        <button 
          title="Settings"
          className="w-full flex justify-center p-3 rounded-xl text-gray-400 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <Settings className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
}