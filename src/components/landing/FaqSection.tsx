import { ChevronDown } from 'lucide-react';
import { FAQS } from './content';

export default function FaqSection() {
  return (
    <section id="faq" className="home-section" aria-labelledby="home-faq-title">
      <h2 id="home-faq-title" className="home-section-title">
        Preguntas frecuentes
      </h2>
      <div className="home-faq">
        {FAQS.map(({ question, answer }) => (
          <details key={question} className="home-faq-item">
            <summary>
              <span>{question}</span>
              <ChevronDown size={18} aria-hidden="true" />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
