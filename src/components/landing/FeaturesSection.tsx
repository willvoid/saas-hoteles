import { FEATURES } from './content';

export default function FeaturesSection() {
  return (
    <section id="funcionalidades" className="home-section" aria-labelledby="home-features-title">
      <h2 id="home-features-title" className="home-section-title">
        Todo lo que necesitás para operar
      </h2>
      <p className="home-section-lead">Las herramientas del día a día de un hotel, sin complicaciones.</p>
      <ul className="home-features">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <li key={title} className="home-feature">
            <span className="home-feature-icon" aria-hidden="true">
              <Icon size={22} />
            </span>
            <h3>{title}</h3>
            <p>{description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
