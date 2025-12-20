import { Users } from 'lucide-react';

const ManageUsers = () => {
  return (
    <div className="rounded-xl border bg-card p-12 shadow-sm text-center">
      <Users className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
      <h2 className="text-xl font-semibold mb-2">User Management</h2>
      <p className="text-muted-foreground">User management features coming soon. New users who sign up are automatically assigned the Staff role.</p>
    </div>
  );
};

export default ManageUsers;
