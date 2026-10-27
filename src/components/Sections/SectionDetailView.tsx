import React from 'react';
import { ExcelSpreadsheetView } from '../Excel/ExcelSpreadsheetView';

interface SectionDetailViewProps {
  sectionCode: 'electricity' | 'water' | 'other';
}

export const SectionDetailView: React.FC<SectionDetailViewProps> = ({ sectionCode }) => {
  return <ExcelSpreadsheetView initialSectionCode={sectionCode} />;
};
