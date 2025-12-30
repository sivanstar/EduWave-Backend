const { Resend } = require('resend');
const dotenv = require('dotenv');

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set. Email sending disabled.');
      return { id: 'mock-email-id', message: 'Email sending disabled (no API key)' };
    }

    // Validate email format
    if (!options.email || !options.email.includes('@')) {
      console.error('Invalid email address:', options.email);
      throw new Error('Invalid email address');
    }

    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'EduWave <onboarding@resend.dev>',
      to: options.email,
      subject: options.subject || 'No Subject',
      html: options.html || '',
    });

    if (error) {
      console.error('Resend error:', error);
      throw error;
    }

    console.log('Email sent successfully via Resend:', data?.id);
    return {
      messageId: data?.id || 'unknown',
      response: data,
    };
  } catch (error) {
    console.error('Error sending email:', error.message || error);
    throw error;
  }
};

module.exports = sendEmail;
