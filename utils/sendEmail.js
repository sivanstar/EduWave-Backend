const { Resend } = require('resend');
const dotenv = require('dotenv');

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper function to format the 'from' field correctly
// Resend requires: "email@example.com" or "Name <email@example.com>"
const formatFromEmail = (email, name = 'EduWave') => {
  if (!email || email.includes('onboarding@resend.dev')) {
    const errorMsg = 'FROM_EMAIL not set or using default testing email. Please set FROM_EMAIL in your .env file to an email address from your verified domain (e.g., noreply@yourdomain.com).';
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // If already in correct format (contains < and >), return as is
  if (email.includes('<') && email.includes('>')) {
    return email;
  }

  // If it's just an email address, format it with the name
  if (email.includes('@')) {
    return `${name} <${email}>`;
  }

  // Invalid format - looks like just a domain was provided
  // Suggest the correct format
  const suggestedEmail = email.includes('.') 
    ? `noreply@${email}` 
    : `noreply@${email}.com`;
  throw new Error(
    `Invalid FROM_EMAIL format: "${email}". ` +
    `FROM_EMAIL must be a complete email address (e.g., noreply@eduwave.com.ng). ` +
    `Did you mean: ${suggestedEmail}? ` +
    `Please update your .env file: FROM_EMAIL=${suggestedEmail}`
  );
};

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

    // Format the 'from' field correctly - must use verified domain
    const fromEmail = formatFromEmail(process.env.FROM_EMAIL, process.env.FROM_NAME || 'EduWave');
    console.log(`Using 'from' email: ${fromEmail}`);
    
    // Warn if using a domain that might not be verified
    if (fromEmail.includes('@resend.dev')) {
      console.warn('WARNING: Using @resend.dev domain. Make sure you have verified your own domain in Resend and set FROM_EMAIL to use that domain.');
    }

    console.log(`Attempting to send email to: ${options.email}`);
    const { data, error } = await resend.emails.send({
      from: fromEmail,
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
