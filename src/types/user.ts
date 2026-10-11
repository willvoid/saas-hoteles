export interface User {
  id: number;
  id_usuario?: number;
  nombre: string;
  correo: string;
  cargo: string;
  /**
   * Nombre de usuario con el que inicia sesión. La sesión lo trae siempre
   * (viene de la fila de `usuario`); es opcional acá porque hay pantallas que
   * arman un User parcial.
   */
  usuario?: string;
  /** Hotel (tenant) al que pertenece la sesión. */
  tenant?: { nombre: string };
}
