# Payroll Management User Guide

## Overview

The Payroll Management module allows you to:
- Import time logs from fingerprint scanners (Excel/CSV files)
- Manage employee pay settings and rates
- Create and manage payroll runs
- Track payments and adjustments
- Generate reports and employee monthly summaries
- Allocate payroll to different buckets/categories

---

## Getting Started

### Accessing Payroll Management

1. Log in to the system as an **Admin** or user with payroll permissions
2. On the main dashboard, click the **"Payroll Management"** tile
3. You'll see the Payroll Management dashboard with 5 main sections

---

## Section 1: Import Time Logs

### Purpose
Import attendance/time logs from your fingerprint scanner (Realand device or similar) into the system.

### Step-by-Step Process

#### Step 1: Prepare Your File
- Export your attendance data from the fingerprint scanner as:
  - `.xls` (Excel 97-2003)
  - `.xlsx` (Excel 2007+)
  - `.csv` (Comma-separated values)

#### Step 2: Upload File
1. Go to **Payroll Management** → **Import Time Logs**
2. Click **"Select File"** and choose your exported file
3. Wait for the preview to load (shows first 100 rows)

#### Step 3: Map Columns
The system will try to auto-detect columns, but you may need to adjust:

**Required Mappings:**
- **Employee Identifier** (required): Select the column that contains employee names or IDs
  - Common names: "NAME", "Employee Name", "USER ID", "ENROLL ID"
  
- **Timestamp OR Date + Time** (required): Choose one option:
  - **Option A**: Single "Timestamp" column (if date and time are together)
  - **Option B**: Separate "Date" column AND "Time" column

**Optional Mappings:**
- **Event Type (IN/OUT)**: Select column showing clock-in/clock-out
  - Common names: "ATT TYPE", "Event Type", "Type"
  - Values like "Clock-in", "Clock-out", "IN", "OUT" will be recognized

**Settings:**
- **Timezone**: Select your timezone (default: Eastern Time)
- **Save as Import Template**: Check this if you want to reuse these mappings later
  - Enter a template name (e.g., "Realand Scanner Export")

#### Step 4: Process Import
1. Review your column mappings
2. Click **"Process Import"**
3. The system will:
   - Check for duplicate files (prevents re-importing the same file)
   - Parse all rows
   - Create time log entries
   - Show you how many rows were imported vs skipped

#### Step 5: View Imported Logs
- After import, you'll be redirected to view the imported time logs
- You can filter by:
  - Date range
  - Employee
  - Unmatched employees (employees not yet linked to payroll employees)

### Tips for Import
- **File Format**: The system accepts various Excel formats, but `.xlsx` works best
- **Column Names**: Column names don't need to match exactly - just select the right column in the mapper
- **Deduplication**: The same file won't be imported twice (based on file hash)
- **Large Files**: Files with hundreds of rows are supported
- **Unmatched Employees**: After import, you'll need to link scanner employees to payroll employees (see Section 2)

---

## Section 2: Employee Pay Settings

### Purpose
Set up employees for payroll calculation, including pay rates, overtime rules, and other settings.

### Step-by-Step Process

#### Step 1: Access Employee Settings
1. Go to **Payroll Management** → **Employee Pay Settings**
2. You'll see a list of existing payroll employees (if any)

#### Step 2: Add New Employee
1. Click **"Add Employee"** or **"New Employee"**
2. Fill in the form:

**Basic Information:**
- **Display Name**: Full name as it should appear in payroll (required)
- **Scanner Code**: Optional - the employee code/ID from your scanner
  - Example: If scanner shows "103" for "Mrs. Brach", enter "103"
  - This helps auto-match imported time logs
- **Link to User Account**: Optional - link to an existing system user
  - Leave blank if this is a payroll-only employee (not a system user)
- **Active**: Check to enable this employee for payroll runs

**Pay Settings:**
- **Pay Type**: Select one:
  - **Hourly** (most common): Paid by the hour
  - **Daily**: Fixed daily rate
  - **Per Shift**: Fixed rate per shift
- **Hourly Rate**: Enter the base hourly rate (required for hourly pay)
  - Example: `25.00` for $25/hour
- **Daily Rate**: Optional - if using daily pay type
- **Per Shift Rate**: Optional - if using per-shift pay type

**Overtime Settings:**
- **Weekly OT After**: Hours before overtime kicks in (default: 40)
  - Example: `40` means overtime after 40 hours per week
- **Daily OT Enabled**: Check if you want daily overtime rules
  - (Advanced feature - typically leave unchecked)

**Other Settings:**
- **Rounding Rule**: How to round hours
  - **None**: No rounding
  - **Up**: Round up to nearest interval
  - **Down**: Round down
  - **Nearest**: Round to nearest interval
- **Break Deduction**: Check if breaks should be deducted from hours
- **Break Minutes**: If break deduction is enabled, enter minutes (e.g., 30 for 30-minute lunch)
- **Labor Burden %**: Optional - percentage to add for labor burden calculation
  - Example: `15.5` for 15.5% burden

#### Step 3: Save Employee
1. Click **"Save"** or **"Create Employee"**
2. The employee will appear in your list

#### Step 4: Edit Employee
1. Click on an employee in the list
2. Make changes
3. Click **"Save"** or **"Update"**

#### Step 5: Link Unmatched Time Logs
After importing time logs, you may see "unmatched" employees:
1. Go to **Import Time Logs** → View imported logs
2. Filter by "Unmatched Employee"
3. For each unmatched employee:
   - Create a new Payroll Employee with matching scanner code
   - OR edit an existing employee and add the scanner code
   - The system will automatically link future imports

### Tips for Employee Setup
- **Scanner Code Matching**: If your scanner uses employee IDs (like "103"), enter that exact code in the "Scanner Code" field
- **Multiple Rates**: Currently, one rate per employee is supported. For multiple rates by role, you can create separate employee records or use allocations (see Section 5)
- **Inactive Employees**: Uncheck "Active" to exclude employees from new payroll runs (keeps historical data)

---

## Section 3: Payroll Runs

### Purpose
Create payroll runs for a specific date range, calculate hours and pay, add adjustments, and track payments.

### Step-by-Step Process

#### Step 1: Create a Payroll Run
1. Go to **Payroll Management** → **Payroll Runs**
2. Click **"Create Payroll Run"** or **"New Run"**

#### Step 2: Define Run Parameters
Fill in the form:

**Run Details:**
- **Name**: Optional - give the run a name (e.g., "January 2025 Payroll")
- **Start Date**: First date of the pay period
- **End Date**: Last date of the pay period
- **Employees**: Select which employees to include
  - You can select all active employees or specific ones

#### Step 3: Generate Draft
1. Click **"Generate Draft"** or **"Calculate"**
2. The system will:
   - Pull all time logs for selected employees in the date range
   - Calculate total hours (regular + overtime)
   - Calculate gross pay based on rates
   - Show a summary for each employee

#### Step 4: Review Draft Results
You'll see a table with:
- **Employee Name**
- **Total Hours**: Sum of all hours worked
- **Regular Hours**: Hours at regular rate
- **Overtime Hours**: Hours at OT rate (after weekly threshold)
- **Gross Pay**: Calculated pay before adjustments
- **Adjustments**: Any manual adjustments (+ or -)
- **Loaded Cost**: Gross pay × (1 + labor burden%) if burden is set
- **Paid Amount**: Amount already paid (starts at $0)
- **Remaining Balance**: Gross + Adjustments - Paid

#### Step 5: Add Adjustments (Optional)
For each employee, you can add adjustments:
1. Click **"Add Adjustment"** or find the adjustment section
2. Enter:
   - **Amount**: Positive for additions, negative for deductions
     - Example: `-50.00` for a $50 deduction
     - Example: `25.00` for a $25 bonus
   - **Reason**: Description (e.g., "Late arrival deduction", "Holiday bonus")
3. Click **"Save Adjustment"**
4. The remaining balance will update automatically

#### Step 6: Approve the Run
1. Review all calculations and adjustments
2. Click **"Approve"** or **"Approve Payroll Run"**
3. Status changes from **DRAFT** → **APPROVED**

#### Step 7: Record Payments
After approval, you can record payments:
1. For each employee, click **"Add Payment"** or **"Record Payment"**
2. Fill in:
   - **Amount**: Payment amount
   - **Payment Date**: When payment was made
   - **Payment Method**: 
     - Check
     - Direct Deposit
     - Cash
     - Other
   - **Reference Number**: Optional - check number, transaction ID, etc.
   - **Note**: Optional - additional notes
3. Click **"Save Payment"**
4. The remaining balance decreases automatically
5. Status can change to **PAID** (if fully paid) or **PARTIALLY_PAID**

#### Step 8: View Run Details
- Click on a payroll run to see:
  - All line items (employees)
  - All adjustments
  - All payments
  - Summary totals

### Payroll Run Statuses
- **DRAFT**: Still being calculated/edited
- **APPROVED**: Finalized, ready for payment
- **PAID**: Fully paid
- **PARTIALLY_PAID**: Some payments recorded, balance remaining

### Tips for Payroll Runs
- **Date Ranges**: Make sure your date range covers all imported time logs you want to include
- **Adjustments**: Use adjustments for one-time bonuses, deductions, corrections
- **Partial Payments**: You can record multiple payments over time (installment payments)
- **Labor Burden**: If set globally or per-employee, loaded cost is calculated automatically

---

## Section 4: Reports / Export

### Purpose
Export payroll runs and summaries to PDF or Excel for record-keeping and accounting.

### Step-by-Step Process

#### Export a Payroll Run
1. Go to **Payroll Management** → **Reports / Export**
2. OR go to a specific Payroll Run and click **"Export"**
3. Choose export format:
   - **PDF**: Printable report with all details
   - **Excel**: Spreadsheet with all data for further analysis

#### Export Monthly Summary
1. Go to **Reports / Export**
2. Select date range or month
3. Choose format (PDF or Excel)
4. Download the summary report

### What's Included in Exports
- **Payroll Run PDF/Excel**:
  - Run details (name, dates, status)
  - Employee line items (hours, pay, adjustments)
  - Payment records
  - Summary totals

- **Monthly Summary**:
  - All payroll runs for the period
  - Per-employee totals
  - Payment summaries
  - Remaining balances

---

## Section 5: Employee Reports (Monthly PDFs)

### Purpose
Generate detailed monthly reports for individual employees showing daily breakdown, totals, and payment history.

### Step-by-Step Process

#### Step 1: Access Employee Reports
1. Go to **Payroll Management** → **Employee Reports (Monthly PDFs)**
2. You'll see filters and a list of employees

#### Step 2: Generate Report
1. Select:
   - **Employee**: Choose from dropdown
   - **Month**: Select month (1-12)
   - **Year**: Enter year (e.g., 2025)
2. Click **"Generate Report"** or **"Download PDF"**

#### Step 3: Review Report
The PDF includes:
- **Employee Information**: Name, code, pay rate
- **Period**: Month and year
- **Daily Breakdown**: For each day:
  - Date
  - First clock-in time
  - Last clock-out time
  - Total hours for the day
  - IN/OUT pairs (if available)
- **Weekly Totals**: Hours per week
- **Period Totals**:
  - Total hours
  - Regular hours
  - Overtime hours
  - Gross pay
- **Adjustments List**: All adjustments with reasons
- **Payments List**: All payments with dates, methods, reference numbers
- **Remaining Balance**: Unpaid amount
- **Bucket Allocations**: If allocations were made (see below)
- **Loaded Cost**: If labor burden is applied

#### Step 4: Batch Generate (Optional)
- Generate reports for all employees for a month at once
- Downloads as a ZIP file or list of PDFs

### Tips for Employee Reports
- **Use Cases**: 
  - Employee pay stubs
  - Dispute resolution
  - Audit documentation
  - Tax records
- **Frequency**: Generate monthly after each payroll run

---

## Section 6: Allocations (Bucket System)

### Purpose
Allocate portions of an employee's pay to different categories/buckets (e.g., different funding sources, projects, cost centers).

### Step-by-Step Process

#### Step 1: Manage Buckets
1. Go to **Payroll Management** → **Payroll Runs**
2. Find or create a payroll run
3. Look for **"Allocations"** or **"Buckets"** section

#### Step 2: Create Buckets (if needed)
1. Click **"Manage Buckets"** or **"Add Bucket"**
2. Enter:
   - **Name**: Bucket name (e.g., "Medicaid", "Private Pay", "Grant Funding")
   - **Description**: Optional description
3. Click **"Save"**

#### Step 3: Allocate Pay
For each employee in a payroll run:
1. Click **"Allocate"** or find the allocation section
2. Select a **Bucket**
3. Enter **Amount** to allocate to that bucket
4. Repeat for additional buckets
5. **Important**: Total allocations must equal the employee's gross pay
   - System will warn if totals don't match
6. Click **"Save Allocations"**

#### Step 4: View Allocations
- See allocations in:
  - Payroll run details
  - Employee monthly reports
  - Monthly summary exports

### Tips for Allocations
- **Use Cases**: 
  - Split pay across funding sources
  - Track costs by project
  - Allocate to different cost centers
- **Validation**: System ensures allocations sum to total pay (prevents errors)
- **Reporting**: Allocations appear in exports and reports

---

## Common Workflows

### Workflow 1: First-Time Setup
1. **Import Time Logs**: Upload your first scanner export
2. **Create Employees**: Set up all employees with pay rates
3. **Link Employees**: Match scanner codes to payroll employees
4. **Create Payroll Run**: Generate your first payroll run
5. **Approve & Pay**: Approve and record payments

### Workflow 2: Weekly/Monthly Payroll
1. **Import Time Logs**: Upload latest scanner export
2. **Create Payroll Run**: Select date range and employees
3. **Review Calculations**: Check hours and pay
4. **Add Adjustments**: If needed
5. **Approve Run**: Finalize
6. **Record Payments**: As payments are made
7. **Export Reports**: For records

### Workflow 3: Employee Inquiry
1. **Generate Employee Report**: Select employee and month
2. **Review Daily Breakdown**: Check hours and times
3. **Review Payments**: Verify payment history
4. **Export PDF**: Provide to employee if needed

---

## Permissions

### Admin Access
- Admins have full access to all payroll features automatically

### Custom Roles
If you're not an admin, you need these permissions:
- **payroll.view**: View payroll dashboard and reports
- **payroll.import_logs**: Import time logs
- **payroll.manage_employees**: Create/edit employees
- **payroll.create_run**: Create payroll runs
- **payroll.approve_run**: Approve payroll runs
- **payroll.record_payments**: Record payments
- **payroll.export**: Export reports
- **payroll.employee_reports**: Generate employee reports

Contact your system administrator to grant these permissions.

---

## Troubleshooting

### Import Issues
- **"File already imported"**: The same file was imported before. Use a different file or check existing imports.
- **"No employee column found"**: Make sure you mapped the Employee Identifier column correctly.
- **"Invalid date/time"**: Check your Date and Time column mappings. Ensure dates are in a standard format.

### Calculation Issues
- **Hours seem wrong**: Check time log imports for the date range. Verify employee pay rates are correct.
- **Overtime not calculating**: Check "Weekly OT After" setting (should be 40 for standard overtime).

### Employee Matching Issues
- **Unmatched employees**: Add the scanner code to the payroll employee record to auto-match future imports.

---

## Best Practices

1. **Regular Imports**: Import time logs regularly (daily or weekly) to keep data current
2. **Save Templates**: Save import templates for consistent column mapping
3. **Review Before Approving**: Always review payroll runs before approving
4. **Document Adjustments**: Use clear reasons for adjustments for audit trails
5. **Regular Reports**: Generate monthly employee reports for records
6. **Backup Exports**: Export payroll runs to PDF/Excel for backup

---

## Support

If you encounter issues:
1. Check this guide first
2. Review error messages carefully
3. Contact your system administrator
4. Check that you have the necessary permissions

---

## Quick Reference

| Feature | Location | Purpose |
|---------|----------|---------|
| Import Time Logs | Payroll → Import Time Logs | Upload scanner exports |
| Employee Settings | Payroll → Employee Pay Settings | Manage employees and rates |
| Create Payroll Run | Payroll → Payroll Runs | Calculate and process payroll |
| Export Reports | Payroll → Reports / Export | Download PDF/Excel |
| Employee Reports | Payroll → Employee Reports | Generate monthly PDFs |
| Allocations | Payroll Runs → Allocations | Split pay by category |

---

**Last Updated**: January 2025
**Version**: 1.0
