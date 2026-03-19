import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertTriangle, CheckCircle, MessageCircle, Mail, Phone } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ReadyForDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ordenProductoId: string | null;
  onConfirm: () => void;
}

export function ReadyForDeliveryDialog({ open, onOpenChange, ordenProductoId, onConfirm }: ReadyForDeliveryDialogProps) {
  const { data: info, isLoading } = useQuery({
    queryKey: ['ready-delivery-info', ordenProductoId],
    queryFn: async () => {
      if (!ordenProductoId) return null;
      const { data, error } = await supabase
        .from('orden_productos')
        .select('*, ordenes(id, saldo_pendiente, total_final, modalidad_pago, pacientes(nombres, apellidos, telefono, email, numero_documento))')
        .eq('id', ordenProductoId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!ordenProductoId && open,
  });

  if (!open || !ordenProductoId) return null;

  const paciente = (info as any)?.ordenes?.pacientes;
  const orden = (info as any)?.ordenes;
  const saldoPendiente = orden?.saldo_pendiente || 0;
  const totalFinal = orden?.total_final || 0;
  const tieneSaldo = saldoPendiente > 0;
  const esProgresivo = (info as any)?.tipo_lente_tiempo === 'progresivo';

  const nombrePaciente = paciente ? `${paciente.nombres} ${paciente.apellidos}` : 'Paciente';
  const telefono = paciente?.telefono;
  const email = paciente?.email;

  const mensajeWhatsApp = encodeURIComponent(
    `Hola ${nombrePaciente}, le informamos que sus gafas están listas para entrega en nuestra óptica Cristal Iris. ` +
    (tieneSaldo
      ? `Le recordamos que tiene un saldo pendiente de $${saldoPendiente.toLocaleString('es-CO')} que debe ser cancelado al momento de la entrega. `
      : '') +
    (esProgresivo
      ? 'Por tratarse de lentes progresivos, la entrega se realizará en consultorio para asegurar una adaptación correcta. '
      : '') +
    '¡Lo esperamos!'
  );

  const mensajeEmail = encodeURIComponent(
    `Estimado/a ${nombrePaciente},\n\n` +
    `Le informamos que sus gafas están listas para entrega en nuestra óptica Cristal Iris.\n\n` +
    (tieneSaldo
      ? `Saldo pendiente: $${saldoPendiente.toLocaleString('es-CO')} (debe cancelarse al momento de la entrega).\n\n`
      : '') +
    (esProgresivo
      ? 'Por tratarse de lentes progresivos, la entrega se realizará en consultorio para asegurar una adaptación correcta.\n\n'
      : '') +
    '¡Lo esperamos!\n\nCristal Iris — Óptica'
  );

  const handleWhatsApp = () => {
    if (!telefono) { toast.error('El paciente no tiene teléfono registrado'); return; }
    const cleanPhone = telefono.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;
    window.open(`https://wa.me/${phoneWithCountry}?text=${mensajeWhatsApp}`, '_blank');
    toast.success('WhatsApp abierto');
  };

  const handleEmail = () => {
    if (!email) { toast.error('El paciente no tiene email registrado'); return; }
    window.open(`mailto:${email}?subject=${encodeURIComponent('Sus gafas están listas — Cristal Iris')}&body=${mensajeEmail}`, '_blank');
    toast.success('Email abierto');
  };

  const handleConfirmAndNotify = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-success" />
            Listo para Entrega
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center py-6 text-muted-foreground">Cargando información...</p>
        ) : (
          <div className="space-y-4">
            {/* Patient Info */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <p className="font-medium">{nombrePaciente}</p>
              <p className="text-sm text-muted-foreground">{paciente?.numero_documento}</p>
              <div className="flex gap-3 text-xs text-muted-foreground">
                {telefono && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{telefono}</span>}
                {email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{email}</span>}
              </div>
            </div>

            {/* Balance Check */}
            {tieneSaldo ? (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-semibold text-destructive">Saldo Pendiente</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total orden: ${totalFinal?.toLocaleString('es-CO')}</span>
                  <span className="text-lg font-bold text-destructive">${saldoPendiente.toLocaleString('es-CO')}</span>
                </div>
                <p className="text-xs text-destructive/80">El paciente debe cancelar el saldo antes de la entrega</p>
              </div>
            ) : (
              <div className="rounded-lg bg-success/10 border border-success/30 p-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                <span className="text-sm font-medium text-success">Pago completo — Sin saldo pendiente</span>
              </div>
            )}

            {/* Progressive Warning */}
            {esProgresivo && (
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-sm">Progresivo — Entregar en consultorio</span>
              </div>
            )}

            <Separator />

            {/* Notification Buttons */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Notificar al paciente</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleWhatsApp}
                  disabled={!telefono}
                >
                  <MessageCircle className="h-4 w-4 text-green-500" />
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleEmail}
                  disabled={!email}
                >
                  <Mail className="h-4 w-4 text-primary" />
                  Email
                </Button>
              </div>
              {!telefono && !email && (
                <p className="text-xs text-destructive">El paciente no tiene datos de contacto registrados</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleConfirmAndNotify}>
                Confirmar Cambio de Estado
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
