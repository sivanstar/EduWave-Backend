const CGPACalculation = require('../models/CGPA');

const gradePoints = { A: 5, B: 4, C: 3, D: 2, E: 1, F: 0 };

// Calculate CGPA from semesters data
function calculateCGPA(semesters) {
  let totalUnits = 0;
  let totalPoints = 0;

  semesters.forEach(semester => {
    semester.courses.forEach(course => {
      if (course.grade && course.units > 0) {
        totalUnits += course.units;
        totalPoints += course.units * gradePoints[course.grade];
      }
    });
  });

  return totalUnits > 0 ? (totalPoints / totalUnits) : 0;
}

// Save or update CGPA calculation
exports.saveCalculation = async (req, res) => {
  try {
    const { semesters } = req.body;

    if (!semesters || !Array.isArray(semesters)) {
      return res.status(400).json({
        success: false,
        message: 'Semesters array is required',
      });
    }

    // Calculate CGPA
    const cgpa = calculateCGPA(semesters);

    // Find existing calculation or create new
    let calculation = await CGPACalculation.findOne({ user: req.user._id });

    if (calculation) {
      calculation.semesters = semesters;
      calculation.cgpa = cgpa;
      calculation.calculatedAt = new Date();
      await calculation.save();
    } else {
      calculation = await CGPACalculation.create({
        user: req.user._id,
        semesters,
        cgpa,
      });
    }

    res.status(200).json({
      success: true,
      data: calculation,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user's CGPA calculation
exports.getCalculation = async (req, res) => {
  try {
    const calculation = await CGPACalculation.findOne({ user: req.user._id });

    if (!calculation) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'No calculation found',
      });
    }

    res.status(200).json({
      success: true,
      data: calculation,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Calculate CGPA from provided data (without saving)
exports.calculate = async (req, res) => {
  try {
    const { semesters, assumedGrade } = req.body;

    if (!semesters || !Array.isArray(semesters)) {
      return res.status(400).json({
        success: false,
        message: 'Semesters array is required',
      });
    }

    // Calculate actual CGPA
    let totalUnits = 0;
    let totalPoints = 0;
    let projectedUnits = 0;
    let projectedPoints = 0;
    const semesterResults = [];

    semesters.forEach((semester, index) => {
      let semUnits = 0;
      let semPoints = 0;
      let semGradedUnits = 0;
      let semMissingUnits = 0;

      semester.courses.forEach(course => {
        if (course.units > 0) {
          semUnits += course.units;

          if (course.grade) {
            semGradedUnits += course.units;
            semPoints += course.units * gradePoints[course.grade];
            totalUnits += course.units;
            totalPoints += course.units * gradePoints[course.grade];
            projectedUnits += course.units;
            projectedPoints += course.units * gradePoints[course.grade];
          } else {
            semMissingUnits += course.units;
            if (assumedGrade) {
              projectedUnits += course.units;
              projectedPoints += course.units * gradePoints[assumedGrade];
            }
          }
        }
      });

      if (semUnits > 0) {
        semesterResults.push({
          number: semester.number || index + 1,
          totalUnits: semUnits,
          gradedUnits: semGradedUnits,
          missingUnits: semMissingUnits,
          points: semPoints,
          cpa: semGradedUnits > 0 ? (semPoints / semGradedUnits) : null,
        });
      }
    });

    const cgpa = totalUnits > 0 ? (totalPoints / totalUnits) : 0;
    const projectedCGPA = assumedGrade && projectedUnits > 0 
      ? (projectedPoints / projectedUnits) 
      : null;

    res.status(200).json({
      success: true,
      data: {
        cgpa: parseFloat(cgpa.toFixed(2)),
        projectedCGPA: projectedCGPA ? parseFloat(projectedCGPA.toFixed(2)) : null,
        totalUnits,
        totalPoints: parseFloat(totalPoints.toFixed(1)),
        semesters: semesterResults,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete calculation
exports.deleteCalculation = async (req, res) => {
  try {
    const calculation = await CGPACalculation.findOneAndDelete({ user: req.user._id });

    if (!calculation) {
      return res.status(404).json({
        success: false,
        message: 'No calculation found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Calculation deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

