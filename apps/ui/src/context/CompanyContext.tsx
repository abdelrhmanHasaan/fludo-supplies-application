import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '../api/client';

export interface CompanyProfile {
  id?: string;
  name_ar: string;
  name_en?: string;
  tagline?: string;
  address?: string;
  phones?: string;
  logo_path?: string;
  is_setup_completed?: boolean;
}

interface CompanyContextType {
  company: CompanyProfile;
  logoLetter: string;
  isSetupCompleted: boolean;
  loading: boolean;
  refreshCompany: () => Promise<void>;
  showSetupModal: boolean;
  setShowSetupModal: (open: boolean) => void;
}

const defaultCompany: CompanyProfile = {
  name_ar: 'شركة الرضا للتوريدات',
  name_en: 'AL REDA SUPPLIES CO.',
  tagline: 'مواد البناء والتوريدات العامة',
  address: 'كرداسة — الجيزة',
  phones: '01030343576',
  is_setup_completed: true,
};

const CompanyContext = createContext<CompanyContextType>({
  company: defaultCompany,
  logoLetter: 'ر',
  isSetupCompleted: true,
  loading: false,
  refreshCompany: async () => {},
  showSetupModal: false,
  setShowSetupModal: () => {},
});

export function computeLogoLetter(name: string): string {
  if (!name) return 'ف';
  const clean = name.trim();
  // Strip common Arabic prefixes like "شركة " or "مؤسسة " to get the core name letter
  let core = clean;
  if (core.startsWith('شركة ')) core = core.slice(5).trim();
  else if (core.startsWith('مؤسسة ')) core = core.slice(6).trim();
  else if (core.startsWith('مصنع ')) core = core.slice(5).trim();
  else if (core.startsWith('مكتب ')) core = core.slice(5).trim();

  // Strip "ال" if present
  if (core.startsWith('ال') && core.length > 2) {
    core = core.slice(2).trim();
  }

  return core.charAt(0) || clean.charAt(0) || 'ف';
}

export const CompanyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [company, setCompany] = useState<CompanyProfile>(defaultCompany);
  const [loading, setLoading] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);

  const fetchProfile = async () => {
    try {
      const data = await api.getCompanyProfile();
      if (data && data.name_ar) {
        setCompany(data);
        if (data.is_setup_completed === false) {
          setShowSetupModal(true);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch company profile, using fallback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const logoLetter = computeLogoLetter(company.name_ar);
  const isSetupCompleted = company.is_setup_completed ?? true;

  return (
    <CompanyContext.Provider
      value={{
        company,
        logoLetter,
        isSetupCompleted,
        loading,
        refreshCompany: fetchProfile,
        showSetupModal,
        setShowSetupModal,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompany = () => useContext(CompanyContext);
