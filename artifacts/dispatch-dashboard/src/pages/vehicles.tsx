import { useState } from "react";
import { useListVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, VehicleInput, VehicleUpdate } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function Vehicles() {
  const queryClient = useQueryClient();
  const { data: vehicles = [], isLoading } = useListVehicles({}, { query: { queryKey: ["/api/vehicles"] } });
  
  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: VehicleInput = {
      name: fd.get("name") as string,
      plate: fd.get("plate") as string,
      type: fd.get("type") as "fixed" | "outsource",
      driverName: fd.get("driverName") as string,
      phone: fd.get("phone") as string,
      capacity: parseInt(fd.get("capacity") as string) || 4,
    };
    createMutation.mutate({ data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
        setIsCreateOpen(false);
      }
    });
  };

  const handleUpdate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: VehicleUpdate = {
      name: fd.get("name") as string,
      plate: fd.get("plate") as string,
      type: fd.get("type") as "fixed" | "outsource",
      driverName: fd.get("driverName") as string,
      phone: fd.get("phone") as string,
      capacity: parseInt(fd.get("capacity") as string) || 4,
    };
    updateMutation.mutate({ id: editingVehicle.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
        setEditingVehicle(null);
      }
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Are you sure?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
        }
      });
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehicles Management</h1>
          <p className="text-muted-foreground text-sm">Manage fleet and outsource drivers</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" /> Add Vehicle</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plate Number</Label>
                  <Input name="plate" required />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Model/Name</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue="fixed">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed (Owned)</SelectItem>
                      <SelectItem value="outsource">Outsource (Temp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacity (Pax)</Label>
                  <Input name="capacity" type="number" defaultValue="4" required />
                </div>
                <div className="space-y-2">
                  <Label>Driver Name</Label>
                  <Input name="driverName" required />
                </div>
                <div className="space-y-2">
                  <Label>Driver Phone</Label>
                  <Input name="phone" required />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMutation.isPending}>Create Vehicle</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Plate</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Queue</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">Loading vehicles...</TableCell>
                </TableRow>
              ) : vehicles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">No vehicles found</TableCell>
                </TableRow>
              ) : (
                vehicles.map(v => (
                  <TableRow key={v.id} className={v.type === 'outsource' ? 'bg-amber-50/10' : ''}>
                    <TableCell className="font-mono font-medium">{v.plate}</TableCell>
                    <TableCell>{v.name}</TableCell>
                    <TableCell>
                      <Badge variant={v.type === 'fixed' ? 'default' : 'outline'} className={v.type === 'outsource' ? 'border-dashed border-amber-400 text-amber-700' : ''}>
                        {v.type}
                      </Badge>
                    </TableCell>
                    <TableCell>{v.driverName}</TableCell>
                    <TableCell>{v.phone}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === 'empty' ? 'secondary' : v.status === 'busy' ? 'default' : 'destructive'}>
                        {v.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {v.queuePosition ? <span className="font-mono">#{v.queuePosition}</span> : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setEditingVehicle(v)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(v.id)} className="text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!editingVehicle} onOpenChange={() => setEditingVehicle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Vehicle</DialogTitle>
          </DialogHeader>
          {editingVehicle && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plate Number</Label>
                  <Input name="plate" defaultValue={editingVehicle.plate} required />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Model/Name</Label>
                  <Input name="name" defaultValue={editingVehicle.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select name="type" defaultValue={editingVehicle.type}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed (Owned)</SelectItem>
                      <SelectItem value="outsource">Outsource (Temp)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacity (Pax)</Label>
                  <Input name="capacity" type="number" defaultValue={editingVehicle.capacity} required />
                </div>
                <div className="space-y-2">
                  <Label>Driver Name</Label>
                  <Input name="driverName" defaultValue={editingVehicle.driverName} required />
                </div>
                <div className="space-y-2">
                  <Label>Driver Phone</Label>
                  <Input name="phone" defaultValue={editingVehicle.phone} required />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>Save Changes</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
