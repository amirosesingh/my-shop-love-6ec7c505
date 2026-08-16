/**
 * Roles, permissions and staff PIN accounts in one place.
 */
import { RoleManager } from "@/components/admin/RoleManager";
import { StaffManager } from "@/components/admin/StaffManager";

export function StaffSecurityPanel() {
  return (
    <div className="space-y-6">
      <RoleManager />
      <StaffManager />
    </div>
  );
}
