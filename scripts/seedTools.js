const mongoose = require('mongoose');
require('dotenv').config();
const connectDB = require('../config/database');
const Tool = require('../models/Tool');

// Tools data from frontend
const toolsData = [
  {
    id: 'progress-analytics',
    name: 'Progress Analytics',
    icon: '<i class="fas fa-chart-line"></i>',
    description: 'Track your learning progress with detailed analytics, performance metrics, and personalized insights.',
    category: 'Analytics',
    status: 'available',
    url: 'progress-analytics.html'
  },
  {
    id: 'study-planner',
    name: 'Smart Study Planner',
    icon: '<i class="fas fa-calendar-alt"></i>',
    description: 'AI-powered study scheduling that adapts to your goals, availability, and learning pace.',
    category: 'Planning',
    status: 'available',
    url: 'study-planner.html'
  },
  {
    id: 'study-companion',
    name: ' Study Companion',
    icon: '<i class="fas fa-book"></i>',
    description: 'AI Smart assistant designed to help understand study materials faster.',
    category: 'Academic',
    status: 'coming-soon',
    url: '#'
  },
  {
    id: 'cgpa-calculator',
    name: 'CGPA Calculator',
    icon: '<i class="fas fa-calculator"></i>',
    description: 'Calculate your Cumulative Grade Point Average by inputting courses and grades with precision.',
    category: 'Academic',
    status: 'available',
    url: 'cgpa-calculator.html'
  },
  {
    id: 'text-to-pdf',
    name: 'Text to PDF',
    icon: '<i class="fas fa-file-pdf"></i>',
    description: 'Convert text documents, notes, and content into professionally formatted PDF files.',
    category: 'Document',
    status: 'available',
    url: 'text-to-pdf.html'
  },
  {
    id: 'pdf-to-link',
    name: 'PDF to Link',
    icon: '<i class="fas fa-link"></i>',
    description: 'Upload PDFs and generate shareable links for easy document distribution and access.',
    category: 'File Sharing',
    status: 'available',
    url: 'pdf-to-link.html'
  },
  {
    id: 'course-creator',
    name: 'Course Creator (For Instructors)',
    icon: '<i class="fas fa-chalkboard-teacher"></i>',
    description: 'Create and manage courses with video content, structured lessons, and comprehensive learning materials.',
    category: 'Academic',
    status: 'available',
    url: 'course-creator.html'
  },
  {
    id: 'access-course',
    name: 'Access Course (For Students)',
    icon: '<i class="fas fa-unlock"></i>',
    description: 'Enter your access code to view course materials shared by educators.',
    category: 'Academic',
    status: 'available',
    url: 'course-access.html'
  }
];

async function seedTools() {
  try {
    // Connect to database
    await connectDB();
    console.log('Connected to database');

    // Clear existing tools (optional - comment out if you want to keep existing data)
    // await Tool.deleteMany({});
    // console.log('Cleared existing tools');

    // Insert tools
    for (const toolData of toolsData) {
      const existingTool = await Tool.findOne({ id: toolData.id });
      
      if (existingTool) {
        console.log(`Tool "${toolData.name}" already exists, skipping...`);
      } else {
        const tool = new Tool(toolData);
        await tool.save();
        console.log(`✓ Seeded tool: ${toolData.name}`);
      }
    }

    console.log('\n✅ Tools seeding completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding tools:', error);
    process.exit(1);
  }
}

// Run the seed function
seedTools();

