import { usePublicPlans } from '../hooks/usePublicPlans';
import LandingNav from '../components/landing/LandingNav';
import Hero from '../components/landing/Hero';
import PricingSection from '../components/landing/PricingSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import FaqSection from '../components/landing/FaqSection';
import WhatsAppContact from '../components/landing/WhatsAppContact';
import LandingFooter from '../components/landing/LandingFooter';
import './Home.css';

interface HomeProps {
  isSignedIn: boolean;
}

// Public marketing page at `/` (not to be confused with LandingPage, the
// per-hotel booking page at /h/:slug).
export default function Home({ isSignedIn }: HomeProps) {
  const { plans, loading, error, retry } = usePublicPlans();

  return (
    <div className="home-page">
      <div className="home-orb home-orb-1" aria-hidden="true" />
      <div className="home-orb home-orb-2" aria-hidden="true" />
      <LandingNav isSignedIn={isSignedIn} />
      <main className="home-main">
        <Hero />
        <PricingSection plans={plans} loading={loading} error={error} onRetry={retry} />
        <FeaturesSection />
        <FaqSection />
        <WhatsAppContact />
      </main>
      <LandingFooter />
    </div>
  );
}
