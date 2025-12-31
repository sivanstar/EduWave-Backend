const { Resend } = require('resend');
const dotenv = require('dotenv');

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      const errorMsg = 'RESEND_API_KEY not set. Email sending disabled. Please set RESEND_API_KEY in your .env file.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Validate email format
    if (!options.email || !options.email.includes('@')) {
      console.error('Invalid email address:', options.email);
      throw new Error('Invalid email address');
    }

    // Validate required fields
    if (!options.subject) {
      console.error('Email subject is required');
      throw new Error('Email subject is required');
    }

    if (!options.html) {
      console.error('Email HTML content is required');
      throw new Error('Email HTML content is required');
    }

    console.log(`Attempting to send email to: ${options.email}`);
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'EduWave <onboarding@resend.dev>',
      to: options.email,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      console.error('Resend API error:', JSON.stringify(error, null, 2));
      throw new Error(`Resend API error: ${error.message || JSON.stringify(error)}`);
    }

    console.log('Email sent successfully via Resend. Message ID:', data?.id);
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
