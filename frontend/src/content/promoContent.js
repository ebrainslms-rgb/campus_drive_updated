/**
 * promoContent.js – Promotional/branding content shown on the auth screens
 * and the pre-exam waiting page.
 *
 * Kept here as plain data, deliberately decoupled from the components that
 * render it (AuthLayout, PromoCarousel). To change what's shown — swap an
 * image, edit a headline, add or remove a card — edit this file only;
 * nothing else needs to change.
 */

export const authPromoHighlights = [
  {
    title: "Java Full Stack Training",
    description: "Industry-aligned curriculum covering Core Java, Spring Boot, React and MySQL.",
  },
  {
    title: "Campus Placement Drives",
    description: "Regular examination drives conducted across partner engineering colleges.",
  },
  {
    title: "Hands-on Assessment",
    description: "Structured aptitude, logical, frontend and programming evaluation.",
  },
];

/** Cards shown in the pre-exam waiting carousel. */
export const preExamPromoCards = [
  {
    title: "Java Full Stack Program",
    description: "Comprehensive training covering the complete development lifecycle — from Core Java fundamentals to production-ready Spring Boot and React applications.",
  },
  {
    title: "Institute Achievements",
    description: "EchoBrains has trained and placed students across leading technology companies through structured campus drives.",
  },
  {
    title: "Assessment Structure",
    description: "Your exam covers four sections — Aptitude, Logical Reasoning, Frontend and Programming — designed to evaluate well-rounded readiness.",
  },
  {
    title: "Stay Focused",
    description: "Once your exam begins, avoid switching tabs or windows. Read each question carefully before selecting your answer.",
  },
];
