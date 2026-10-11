import { useCallback, useEffect, useState } from 'react';
import { NotificacionService, NotificacionRow } from '../services/notificacionService';

export function useNotificaciones(usuarioId: number | undefined) {
  const [items, setItems] = useState<NotificacionRow[]>([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [loading, setLoading] = useState(true);

  const recargar = useCallback(async () => {
    setLoading(true);
    try {
      const [bandeja, count] = await Promise.all([
        NotificacionService.getBandeja(),
        NotificacionService.contarNoLeidas()
      ]);
      setItems(bandeja);
      setNoLeidas(count);
    } catch (err) {
      console.error('Error loading notificaciones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!usuarioId) {
      setItems([]);
      setNoLeidas(0);
      setLoading(false);
      return;
    }

    recargar();

    const unsubscribe = NotificacionService.subscribe(usuarioId, (nueva) => {
      setItems((prev) => [nueva, ...prev]);
      setNoLeidas((prev) => prev + 1);
    });

    return unsubscribe;
  }, [usuarioId, recargar]);

  const marcarLeida = useCallback(async (id: number) => {
    const target = items.find((n) => n.id_notificacion === id);
    if (!target || target.leida) return;

    setItems((prev) =>
      prev.map((n) => (n.id_notificacion === id ? { ...n, leida: true } : n))
    );
    setNoLeidas((prev) => Math.max(0, prev - 1));

    try {
      await NotificacionService.marcarLeida(id);
    } catch (err) {
      console.error('Error marking notificacion as read:', err);
    }
  }, [items]);

  const marcarTodasLeidas = useCallback(async () => {
    if (noLeidas === 0) return;

    setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    setNoLeidas(0);

    try {
      await NotificacionService.marcarTodasLeidas();
    } catch (err) {
      console.error('Error marking all notificaciones as read:', err);
    }
  }, [noLeidas]);

  return { items, noLeidas, loading, marcarLeida, marcarTodasLeidas, recargar };
}
