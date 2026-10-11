import React from 'react';
import { useBooking } from '../../context/BookingContext';
import Step1Dates from './Step1Dates';
import Step2Rooms from './Step2Rooms';
import Step3Guests from './Step3Guests';
import Step4Client from './Step4Client';
import './BookingWizard.css';

export default function BookingWizard() {
  const { currentStep } = useBooking();

  const steps = [
    { num: 1, label: 'Fechas' },
    { num: 2, label: 'Habitaciones' },
    { num: 3, label: 'Huéspedes' },
    { num: 4, label: 'Finalizar' }
  ];

  return (
    <div className="booking-wizard-container">
      <div className="wizard-progress-bar">
        {steps.map((step, index) => (
          <React.Fragment key={step.num}>
            <div className={`wizard-step ${currentStep >= step.num ? 'active' : ''} ${currentStep > step.num ? 'completed' : ''}`}>
              <div className="step-circle">{step.num}</div>
              <span className="step-label">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`wizard-line ${currentStep > step.num ? 'active' : ''}`} />
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="wizard-content">
        {currentStep === 1 && <Step1Dates />}
        {currentStep === 2 && <Step2Rooms />}
        {currentStep === 3 && <Step3Guests />}
        {currentStep === 4 && <Step4Client />}
      </div>
    </div>
  );
}
