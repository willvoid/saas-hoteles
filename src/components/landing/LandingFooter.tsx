import { Link } from 'react-router-dom';

export default function LandingFooter() {
  return (
    <footer className="home-footer">
      <p>© {new Date().getFullYear()} Gestión Hotelera. Todos los derechos reservados.</p>
      <nav aria-label="Pie de página">
        <Link to="/login">Iniciar sesión</Link>
        <Link to="/registro">Probar gratis</Link>
      </nav>
    </footer>
  );
}
