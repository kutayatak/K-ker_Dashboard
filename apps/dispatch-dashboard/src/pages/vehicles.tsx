import { useState } from "react";
import { useListVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle, VehicleInput, VehicleUpdate } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit2, Trash2, Phone, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export function Vehicles() {
  const queryClient = useQueryClient();
  const { data: vehicles = [], isLoading } = useListVehicles({}, { query: { queryKey: ["/api/vehicles"] } });
  
  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);

  const isValidValue = (val: any) => {
    if (val == null) return false;
    const str = String(val).trim();
    return str !== "" && str !== "System.Xml.XmlElement";
  };

  // Group vehicles by base plate
  const groupedVehicles = vehicles.reduce<any[]>((acc, v) => {
    let basePlate = v.plate;
    let shiftLabel = "Şoför";
    
    const vMatch = v.plate.match(/^(.*?)\s*\(V(\d)\)$/);
    if (vMatch) {
      basePlate = vMatch[1];
      shiftLabel = `Vardiya ${vMatch[2]}`;
    } else if (v.notes?.includes("Vardiya 1")) {
      shiftLabel = "Vardiya 1";
    } else if (v.notes?.includes("Vardiya 2")) {
      shiftLabel = "Vardiya 2";
    } else if (v.notes?.includes("Vardiya 3")) {
      shiftLabel = "Vardiya 3";
    } else if (v.type === "outsource") {
      shiftLabel = "Esnaf";
    } else if (v.name?.includes("Memur")) {
      shiftLabel = "Memur";
    }

    let group = acc.find(g => g.basePlate === basePlate);
    if (!group) {
      group = {
        basePlate,
        baseName: v.name.replace(/\s*\(V\d\)$/, ""),
        type: v.type,
        capacity: v.capacity,
        status: v.status,
        queuePosition: v.queuePosition,
        shifts: []
      };
      acc.push(group);
    }
    
    group.shifts.push({
      id: v.id,
      label: shiftLabel,
      driverName: v.driverName,
      phone: v.phone,
      notes: v.notes,
      raw: v
    });
    
    return acc;
  }, []);

  // Sort shifts inside each group
  groupedVehicles.forEach(g => {
    g.shifts.sort((a: any, b: any) => a.label.localeCompare(b.label, "tr"));
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data: VehicleInput = {
      name: fd.get("name") as string,
      plate: fd.get("plate") as string,
      type: fd.get("type") as "fixed" | "outsource",
      driverName: fd.get("driverName") as string,
      phone: fd.get("phone") as string,
      capacity: 10,
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
      driverName: fd.get("driverName") as string,
      phone: fd.get("phone") as string,
      capacity: 10,
    };
    updateMutation.mutate({ id: editingVehicle.id, data }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
        setEditingVehicle(null);
      }
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Bu aracı silmek istediğinize emin misiniz?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
        }
      });
    }
  };

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Araç Yönetimi</h1>
          <p className="text-muted-foreground text-sm">Filo ve esnaf (dış kaynak) şoförlerini yönetin</p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="w-4 h-4 mr-2" /> Araç Ekle</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Araç Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plaka</Label>
                  <Input name="plate" required />
                </div>
                <div className="space-y-2">
                  <Label>Araç Modeli/Adı</Label>
                  <Input name="name" required />
                </div>
                <div className="space-y-2">
                  <Label>Tür</Label>
                  <Select name="type" defaultValue="fixed">
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Sabit (Öz Mal)</SelectItem>
                      <SelectItem value="outsource">Esnaf (Dış Kaynak)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Şoför Adı</Label>
                  <Input name="driverName" required />
                </div>
                <div className="space-y-2">
                  <Label>Şoför Telefonu</Label>
                  <Input name="phone" required />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={createMutation.isPending}>Araç Oluştur</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Premium Grouped Vehicles Cards Grid */}
      <div className="flex-1 overflow-auto pr-1">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Araçlar yükleniyor...</div>
        ) : groupedVehicles.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Araç bulunamadı</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupedVehicles.map((g: any) => (
              <Card key={g.basePlate} className="flex flex-col hover:shadow-lg transition-all duration-200 border-t-4 border-t-primary/80 overflow-hidden bg-card/60 backdrop-blur-sm">
                
                {/* Card Header */}
                <div className="p-5 border-b border-border flex items-start justify-between bg-muted/20">
                  <div className="space-y-2">
                    <h3 className="font-bold text-lg tracking-tight line-clamp-1">{g.baseName}</h3>
                    
                    {/* Miniature Turkish License Plate */}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 border border-slate-300 rounded font-mono text-xs font-bold bg-white text-slate-800 shadow-sm select-none">
                      <span className="text-[10px] text-blue-600 font-extrabold border-r border-slate-200 pr-1.5 py-0.5">TR</span>
                      {g.basePlate}
                    </div>
                  </div>

                  <Badge variant={g.type === 'fixed' ? 'default' : 'outline'} className={g.type === 'outsource' ? 'border-dashed border-amber-400 text-amber-700 bg-amber-50/50' : 'bg-primary/90 text-primary-foreground'}>
                    {g.type === 'fixed' ? 'Sabit' : 'Esnaf'}
                  </Badge>
                </div>

                {/* Card Body - Driver & Shifts List */}
                <div className="p-5 flex-1 flex flex-col gap-4">
                  <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Şoförler & Vardiyalar</div>
                  
                  <div className="space-y-3 flex-1">
                    {g.shifts.map((s: any) => (
                      <div key={s.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 rounded-lg border border-border bg-background hover:bg-muted/30 transition-colors group/row gap-3 md:gap-0">
                        <div className="space-y-1 flex-1 min-w-0 md:mr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground tracking-wide font-mono uppercase shrink-0">{s.label}</span>
                            <span className="font-semibold text-sm text-foreground truncate">{s.driverName}</span>
                          </div>
                          
                          {s.phone && s.phone !== "Belirtilmedi" && (
                            <a href={`tel:${s.phone.replace(/\s+/g, '')}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors mt-1 font-mono">
                              <Phone className="w-3 h-3 text-muted-foreground/70" />
                              {s.phone}
                            </a>
                          )}
                          
                          {s.notes && s.notes !== "Vardiya 1 Şoförü" && s.notes !== "Vardiya 2 Şoförü" && s.notes !== "Vardiya 3 Şoförü" && s.notes !== "Esnaf Araç" && (
                            <div className="text-[11px] text-muted-foreground/80 italic mt-0.5 truncate">{s.notes}</div>
                          )}
                        </div>

                        {/* Shift Edit/Delete Actions */}
                        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover/row:opacity-100 transition-opacity mt-2 md:mt-0 justify-end md:justify-start border-t md:border-none pt-2 md:pt-0">
                          <Button variant="ghost" size="icon" className="w-8 h-8 md:w-7 md:h-7" onClick={() => setEditingVehicle(s.raw)}>
                            <Edit2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 md:w-7 md:h-7 text-red-500 hover:text-red-600" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="w-4 h-4 md:w-3.5 md:h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Footer */}
                {g.queuePosition && (
                  <div className="p-3 bg-muted/30 border-t border-border flex items-center justify-end text-xs text-muted-foreground">
                    <div className="flex items-center gap-1 font-mono bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
                      <span>Sıra: #{g.queuePosition}</span>
                    </div>
                  </div>
                )}

              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!editingVehicle} onOpenChange={() => setEditingVehicle(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aracı Düzenle</DialogTitle>
          </DialogHeader>
          {editingVehicle && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Plaka</Label>
                  <Input name="plate" defaultValue={editingVehicle.plate} required />
                </div>
                <div className="space-y-2">
                  <Label>Araç Modeli/Adı</Label>
                  <Input name="name" defaultValue={editingVehicle.name} required />
                </div>
                <div className="space-y-2">
                  <Label>Tür</Label>
                  <Select name="type" defaultValue={editingVehicle.type}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Sabit (Öz Mal)</SelectItem>
                      <SelectItem value="outsource">Esnaf (Dış Kaynak)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Şoför Adı</Label>
                  <Input name="driverName" defaultValue={editingVehicle.driverName} required />
                </div>
                <div className="space-y-2">
                  <Label>Şoför Telefonu</Label>
                  <Input name="phone" defaultValue={editingVehicle.phone} required />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={updateMutation.isPending}>Değişiklikleri Kaydet</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
