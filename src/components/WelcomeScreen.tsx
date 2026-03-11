import { useState } from "react";
import { motion } from "framer-motion";
import { Package, Calendar, HelpCircle, Download, ArrowLeft, FileText } from "lucide-react";

interface WelcomeScreenProps {
  onPromptClick: (prompt: string) => void;
}

// Your FAQ Data
const FAQ_DATA = [
  { "category": "Employee (ESS – Employee Self-Service)", "question": "How do I apply for leave?", "answer": "Log in to SAP Fiori → Open My Leave Request → Select leave type and dates → Submit for approval." },
  { "category": "Employee (ESS – Employee Self-Service)", "question": "Where can I view my payslip?", "answer": "Use the My Payslips Fiori app to view or download your payslips." },
  { "category": "Employee (ESS – Employee Self-Service)", "question": "How do I check my leave balance?", "answer": "Open My Leave Balance in SAP Fiori to view available and consumed leave." },
  { "category": "Employee (ESS – Employee Self-Service)", "question": "Can I update my bank or contact details?", "answer": "Yes. Go to My Profile or Manage My Personal Data, update the information, and submit for approval if required." },
  { "category": "Employee (ESS – Employee Self-Service)", "question": "I cannot log in to SAP Fiori. What should I do?", "answer": "Please raise a ticket with IT support to verify user ID, password, and role assignment." },
  { "category": "Employee (ESS – Employee Self-Service)", "question": "How do I submit travel or reimbursement requests?", "answer": "Use the My Travel Requests or Expense Claims app as per company policy." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "How do I approve leave requests?", "answer": "Open My Inbox in SAP Fiori → Review the request → Approve or Reject with comments." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "How can I see my team’s attendance?", "answer": "Use My Team Calendar or Team Attendance Overview in SAP Fiori." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "How do I approve employee expenses?", "answer": "Expense approvals are available in My Inbox under pending workflow items." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "Can I initiate transfers or promotions?", "answer": "Yes. Use the respective MSS HR action app as enabled by HR and SAP roles." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "I approved something by mistake. What now?", "answer": "Please contact HR or SAP support immediately. Reversal depends on process stage." },
  { "category": "Manager (MSS – Manager Self-Service)", "question": "Why don’t I see my team members?", "answer": "This is typically an organizational hierarchy or authorization issue. Contact HRIS or SAP support." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "How do I create a Purchase Requisition?", "answer": "Use Create Purchase Requisition in SAP Fiori, enter material or service details, quantity, and submit for approval." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "How do I convert a PR into a PO?", "answer": "Use Manage Purchase Requisitions or Create Purchase Order and reference the approved PR." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "How do I check PO status?", "answer": "Use Display Purchase Order or Manage Purchase Orders to view delivery, goods receipt, and invoice status." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "What is a Service Entry Sheet?", "answer": "It confirms service delivery against a Service PO and is required before invoice posting." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "How do I create a Goods Receipt?", "answer": "Use Post Goods Receipt and reference the PO. Stock and accounting entries are updated automatically." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "Why is my invoice blocked?", "answer": "Invoice blocks usually occur due to price or quantity mismatch between PO, GR, and Invoice." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "How do I create or change a vendor?", "answer": "Use Manage Business Partner in S/4HANA or raise a request as per vendor onboarding process." },
  { "category": "Procurement (SAP MM – Buyer / Purchase Officer)", "question": "What if delivery is delayed by vendor?", "answer": "Update delivery dates in the PO and follow up with the vendor. Escalate if required." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "How is invoice posting done?", "answer": "Invoices are posted via the Supplier Invoice app after PO and GR validation." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "What is 3-way matching?", "answer": "It matches Purchase Order, Goods Receipt, and Invoice before posting vendor liability." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "Why is an invoice parked instead of posted?", "answer": "Invoices are parked when additional validation or approval is required." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "How do I check vendor payments?", "answer": "Use Display Vendor Line Items or Manage Supplier Line Items." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "What is automatic account determination?", "answer": "SAP automatically determines G/L accounts based on movement type, valuation class, and configuration." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "How do I reverse an invoice?", "answer": "Use Reverse Supplier Invoice if payment is not processed. Otherwise a credit memo is required." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "Why is GR/IR not clearing?", "answer": "GR/IR remains open if quantities or values do not match. Reconciliation is required." },
  { "category": "Finance (FI / AP / GL – Finance & Accounts)", "question": "How do I close a PO financially?", "answer": "Set the Final Invoice or Final Delivery indicator once no further postings are expected." },
  { "category": "Common / Support", "question": "Why can’t I see a Fiori app?", "answer": "This is usually due to missing role or authorization. Contact SAP security or IT support." },
  { "category": "Common / Support", "question": "Who should I contact for SAP issues?", "answer": "Raise a ticket with the SAP Helpdesk or CoE including the document number and screenshots." }
];

type ViewState = 'MAIN' | 'MM' | 'FAQ_CATEGORIES' | 'FAQ_QUESTIONS' | 'MANUALS';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const WelcomeScreen = ({ onPromptClick }: WelcomeScreenProps) => {
  const [view, setView] = useState<ViewState>('MAIN');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = Array.from(new Set(FAQ_DATA.map(item => item.category)));
  const activeQuestions = FAQ_DATA.filter(q => q.category === selectedCategory);

  const mainOptions = [
    { icon: <Package className="h-5 w-5" />, text: "Material Management", action: () => setView('MM'), color: "text-blue-500" },
    { icon: <HelpCircle className="h-5 w-5" />, text: "FAQs", action: () => setView('FAQ_CATEGORIES'), color: "text-purple-500" },
    { icon: <Calendar className="h-5 w-5" />, text: "Leave Request", action: () => onPromptClick("I want to apply for leave"), color: "text-green-500" },
    { icon: <Download className="h-5 w-5" />, text: "Download Manual", action: () => setView('MANUALS'), color: "text-orange-500" },
  ];

  const renderAnimatedList = (items: { text: string; action: () => void }[], showBackBtn: boolean, backAction?: () => void) => (
    <div className="mt-2 md:mt-6 lg:mt-8 flex flex-col gap-2">
      {showBackBtn && (
        <button 
          onClick={backAction} 
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit mb-2 transition-colors pb-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}
      <div className="grid grid-cols-1 gap-1.5 md:gap-3 sm:grid-cols-2">
        {items.map((item, index) => (
          <motion.button
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.05, ease: "easeOut" }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={item.action}
            className="group flex items-start gap-2 md:gap-3 rounded-lg border bg-card p-3 md:p-4 text-left transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center min-h-[28px] md:min-h-0 w-full">
              <p className="font-medium text-xs md:text-sm text-card-foreground">{item.text}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-start md:justify-center text-center px-3 py-2 md:p-4 md:py-12 h-full">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-2xl mx-auto w-full"
      >
        {/* Logo */}
        <div className="mx-auto mb-1 md:mb-3 h-9 w-9 md:h-16 md:w-16 flex items-center justify-center rounded-full bg-primary/10 text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 md:h-8 md:w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a10 10 0 0 0 10-10H2a10 10 0 0 0 10 10z"/><path d="m14.5 13-1.4-1.4a2 2 0 0 0-2.8 0L9 13"/><path d="M12 22V8"/><path d="m12 8-1.5-1.5a2.83 2.83 0 0 1 0-4 2.83 2.83 0 0 1 4 0 2.83 2.83 0 0 1 0 4L12 8z"/></svg>
        </div>
        
        {/* Title */}
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-3xl lg:text-4xl">
          SAP Assistant
        </h1>
        
        {/* Greeting */}
        <p className="mt-0.5 md:mt-2 text-xs text-muted-foreground md:text-base lg:text-lg">
          {getGreeting()}! How can I help you today?
        </p>

        {/* Dynamic Content Views */}
        {view === 'MAIN' && (
          <div className="mt-2 md:mt-6 lg:mt-8 grid grid-cols-1 gap-1.5 md:gap-3 sm:grid-cols-2">
            {mainOptions.map((option, index) => (
              <motion.button
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 + index * 0.1, ease: "easeOut" }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                onClick={option.action}
                className="group flex items-start gap-2 md:gap-3 rounded-lg border bg-card p-2 md:p-3 lg:p-4 text-left transition-colors hover:bg-muted/50"
              >
                <div className={`flex-shrink-0 rounded-md bg-primary/10 p-1 md:p-2 ${option.color}`}>
                  {option.icon}
                </div>
                <div className="flex items-center min-h-[28px] md:min-h-0">
                  <p className="font-medium text-xs md:text-base text-card-foreground">{option.text}</p>
                </div>
              </motion.button>
            ))}
          </div>
        )}

        {view === 'MM' && renderAnimatedList(
          [
            { text: "What are the purchase orders?", action: () => onPromptClick("What are the purchase orders?") },
            { text: "What are the sales orders?", action: () => onPromptClick("What are the sales orders?") },
            { text: "Check stock levels", action: () => onPromptClick("Check stock levels") }
          ],
          true,
          () => setView('MAIN')
        )}

        {view === 'FAQ_CATEGORIES' && renderAnimatedList(
          categories.map(cat => ({
            text: cat,
            action: () => { setSelectedCategory(cat); setView('FAQ_QUESTIONS'); }
          })),
          true,
          () => setView('MAIN')
        )}

        {view === 'FAQ_QUESTIONS' && (
          <div className="mt-2 md:mt-6 lg:mt-8 flex flex-col gap-2">
            <button 
              onClick={() => setView('FAQ_CATEGORIES')} 
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit mb-2 transition-colors pb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Categories
            </button>
            <h3 className="text-sm md:text-md font-semibold mb-2 text-primary text-left">{selectedCategory}</h3>
            <div className="grid grid-cols-1 gap-1.5 md:gap-3">
              {activeQuestions.map((q, index) => (
                <motion.button
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => onPromptClick(q.question)}
                  className="group flex items-start rounded-lg border bg-card p-3 md:p-4 text-left transition-colors hover:bg-muted/50"
                >
                  <p className="font-medium text-xs md:text-sm text-card-foreground">{q.question}</p>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* The New Manuals View! */}
        {view === 'MANUALS' && (
          <div className="mt-2 md:mt-6 lg:mt-8 flex flex-col gap-2">
            <button 
              onClick={() => setView('MAIN')} 
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground w-fit mb-2 transition-colors pb-2"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            
            <div className="grid grid-cols-1 gap-1.5 md:gap-3 max-w-lg mx-auto w-full">
              <motion.a
                href="/MENTOR_MENTEE_USER_MANUAL.pdf"
                download="MENTOR_MENTEE_USER_MANUAL.pdf"
                target="_blank"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-center justify-between gap-2 md:gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50 cursor-pointer no-underline"
              >
                <div className="flex items-center gap-4">
                  <div className="flex-shrink-0 rounded-md bg-blue-500/10 p-2.5 text-blue-500">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground mb-1">Click to download document:</span>
                    <p className="font-bold text-sm md:text-base text-blue-600 dark:text-blue-400 underline decoration-blue-500/30 underline-offset-4">
                      MENTOR MENTEE MANUAL
                    </p>
                  </div>
                </div>
                <Download className="w-5 h-5 text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity" />
              </motion.a>
            </div>
          </div>
        )}

      </motion.div>
    </div>
  );
};