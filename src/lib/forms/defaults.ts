import type { FormField, FormSettings } from "./schema";

const f = (x: Partial<FormField> & Pick<FormField, "key" | "type" | "label">): FormField => ({
  id: x.key,
  required: false,
  width: "half",
  ...x,
});

export const TEST_DRIVE_FORM: { name: string; slug: string; description: string; fields: FormField[]; settings: FormSettings } = {
  name: "YADEA Test Drive Booking",
  slug: "test-drive",
  description: "Prospective customers book a test drive at a specific outlet.",
  fields: [
    f({ key: "first_name", type: "text", label: "First Name", placeholder: "Enter your first name", required: true, mapTo: "firstName" }),
    f({ key: "last_name", type: "text", label: "Last Name", placeholder: "Enter your last name", required: true, mapTo: "lastName" }),
    f({ key: "phone", type: "phone", label: "Phone", placeholder: "+92 3xx xxxxxxx", required: true, mapTo: "phone" }),
    f({ key: "email", type: "email", label: "Email", placeholder: "your@email.com", required: true, mapTo: "email" }),
    f({ key: "test_drive_date", type: "date", label: "Preferred Test-Drive Date", required: true, mapTo: "testDriveDate" }),
    f({ key: "test_drive_time", type: "time", label: "Preferred Time", required: true, mapTo: "testDriveTime", helpText: "Within the outlet's opening hours" }),
    f({ key: "city", type: "select", label: "City", placeholder: "Select City", required: true, optionsSource: "cities", mapTo: "city" }),
    f({ key: "outlet", type: "select", label: "Outlet", placeholder: "Select Outlet", required: true, optionsSource: "outlets", dependsOn: "city", mapTo: "outlet" }),
    f({ key: "bike_model", type: "select", label: "Interested Model", placeholder: "Select Model", required: true, optionsSource: "bikeModels", width: "full", mapTo: "bikeModel" }),
    f({ key: "message", type: "textarea", label: "Additional Message", placeholder: "Anything we should know?", width: "full", mapTo: "message" }),
    f({ key: "consent", type: "consent", label: "Privacy consent", required: true, width: "full", mapTo: "consent" }),
  ],
  settings: {
    title: "Test Drive",
    subtitle: "Select your city, outlet and model — we'll confirm your slot.",
    primaryColor: "#EF6C1A",
    submitLabel: "Book Now",
    successTitle: "Test drive requested!",
    successMessage: "Thank you. The outlet will contact you shortly to confirm your test-drive slot.",
    routing: "SELECTED_OUTLET",
    sourceKey: "WEBSITE",
    allowCityFallback: false,
    cardTitle: "Book a Test Drive",
  },
};

export const GENERAL_INQUIRY_FORM: typeof TEST_DRIVE_FORM = {
  name: "General Customer Inquiry",
  slug: "general-inquiry",
  description: "Product, pricing, availability and other customer questions.",
  fields: [
    f({ key: "first_name", type: "text", label: "First Name", required: true, mapTo: "firstName" }),
    f({ key: "last_name", type: "text", label: "Last Name", mapTo: "lastName" }),
    f({ key: "phone", type: "phone", label: "Phone", placeholder: "+92 3xx xxxxxxx", required: true, mapTo: "phone" }),
    f({ key: "email", type: "email", label: "Email", placeholder: "name@email.com", mapTo: "email" }),
    f({ key: "city", type: "select", label: "City", placeholder: "Select City", required: true, optionsSource: "cities", mapTo: "city" }),
    f({ key: "bike_model", type: "select", label: "Interested Model", placeholder: "Select Model", optionsSource: "bikeModels", mapTo: "bikeModel" }),
    f({
      key: "inquiry_category", type: "select", label: "Inquiry Category", required: true, mapTo: "inquiryCategory", placeholder: "Select category",
      options: [
        { label: "Product information", value: "product_information" },
        { label: "Pricing", value: "pricing" },
        { label: "Availability", value: "availability" },
        { label: "Dealership location", value: "dealership_location" },
        { label: "After-sales inquiry", value: "after_sales" },
        { label: "Other", value: "other" },
      ],
    }),
    f({
      key: "preferred_contact", type: "radio", label: "Preferred Contact Method", required: true, mapTo: "preferredContactMethod",
      options: [
        { label: "Phone call", value: "phone" },
        { label: "WhatsApp", value: "whatsapp" },
        { label: "Email", value: "email" },
      ],
    }),
    f({ key: "message", type: "textarea", label: "Message", placeholder: "How can we help?", required: true, width: "full", mapTo: "message" }),
    f({ key: "consent", type: "consent", label: "Privacy consent", required: true, width: "full", mapTo: "consent" }),
  ],
  settings: {
    title: "Contact YADEA",
    subtitle: "Questions about models, pricing or availability? We're here to help.",
    primaryColor: "#EF6C1A",
    submitLabel: "Send Inquiry",
    successTitle: "Inquiry received",
    successMessage: "Thanks for reaching out. Our team will get back to you shortly.",
    routing: "CITY_AUTO",
    sourceKey: "WEBSITE",
    allowCityFallback: true,
    cardTitle: "General Inquiry",
  },
};

export const DEALERSHIP_APPLICATION_FORM: typeof TEST_DRIVE_FORM = {
  name: "Dealership / Franchise Application",
  slug: "dealership-application",
  description: "Prospective dealer partners apply to open a YADEA dealership.",
  fields: [
    f({
      key: "salutation", type: "select", label: "Salutation", mapTo: "salutation", width: "third",
      options: ["Mr.", "Mrs.", "Ms.", "Dr.", "Other"].map((v) => ({ label: v, value: v })),
    }),
    f({ key: "first_name", type: "text", label: "First Name", placeholder: "First name", required: true, mapTo: "firstName", width: "third" }),
    f({ key: "last_name", type: "text", label: "Last Name", placeholder: "Last name", required: true, mapTo: "lastName", width: "third" }),
    f({ key: "email", type: "email", label: "Email Address", placeholder: "name@email.com", required: true, mapTo: "email" }),
    f({ key: "phone", type: "phone", label: "Phone", placeholder: "+92 3xx xxxxxxx", required: true, mapTo: "phone" }),
    f({ key: "business_name", type: "text", label: "Current Business Name", placeholder: "Business name", required: true, mapTo: "businessName" }),
    f({ key: "business_address", type: "text", label: "Address", placeholder: "Business address", required: true, mapTo: "businessAddress" }),
    f({ key: "years_in_business", type: "number", label: "Years in Automotive Business", placeholder: "e.g. 8", required: true, mapTo: "yearsInBusiness", validation: { min: 0, max: 100 } }),
    f({
      key: "oem_dealer", type: "select", label: "Currently an OEM Dealer", placeholder: "Choose Yes/No", mapTo: "isOemDealer",
      options: [{ label: "Yes", value: "yes" }, { label: "No", value: "no" }],
    }),
    f({ key: "province", type: "select", label: "Province", placeholder: "Select Province", optionsSource: "provinces", mapTo: "province" }),
    f({ key: "city", type: "select", label: "City", placeholder: "Select City", optionsSource: "cities", dependsOn: "province", mapTo: "city" }),
    f({
      key: "property_ownership", type: "select", label: "Property Ownership", placeholder: "Select Property Status", mapTo: "propertyOwnership",
      options: ["Owned", "Rented / Leased", "To be acquired"].map((v) => ({ label: v, value: v })),
    }),
    f({
      key: "business_structure", type: "select", label: "Structure", placeholder: "Select Structure Status", mapTo: "businessStructure",
      options: ["Sole Proprietorship", "Partnership", "Private Limited Company", "Other"].map((v) => ({ label: v, value: v })),
    }),
    f({ key: "attachments", type: "file", label: "Attach File Here", helpText: "Business profile or supporting documents (PDF, DOCX, JPG, PNG)", accept: "document", maxFiles: 5, width: "full", mapTo: "attachments" }),
    f({ key: "consent", type: "consent", label: "Privacy consent", required: true, width: "full", mapTo: "consent" }),
  ],
  settings: {
    title: "Dealership Applications",
    subtitle: "Become a YADEA dealer partner — submit your application for review.",
    primaryColor: "#EF6C1A",
    submitLabel: "Send",
    successTitle: "Application submitted",
    successMessage: "Thank you for your interest in becoming a YADEA partner. Our team will review your application and contact you.",
    routing: "MANUAL",
    sourceKey: "WEBSITE",
    cardTitle: "Dealership Application",
  },
};

export const FORM_TEMPLATES = {
  TEST_DRIVE: TEST_DRIVE_FORM,
  GENERAL_INQUIRY: GENERAL_INQUIRY_FORM,
  DEALERSHIP_APPLICATION: DEALERSHIP_APPLICATION_FORM,
} as const;
