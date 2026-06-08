import { supabase } from './supabase';

// ─── TYPES ───────────────────────────────────────────────────

export type DbFund = {
  id: string;
  name: string;
  vintage: number;
  target_size?: number;
  committed: number;
  called: number;
  invested: number;
  nav: number;
  distributions: number;
  moic: number;
  irr: number;
  dpi: number;
  management_fee: number;
  carried_interest: number;
  hurdle_rate: number;
  fund_life: number;
  currency: string;
  status: 'Active' | 'Fundraising' | 'Closed';
  focus: string[];
  description?: string;
  start_date?: string;
  created_at: string;
  updated_at: string;
};

export type DbLP = {
  id: string;
  fund_id: string;
  name: string;
  email?: string;
  phone?: string;
  type: 'Individual' | 'Institution' | 'Family Office' | 'Corporate';
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  commitment: number;
  called: number;
  distributions: number;
  ownership_pct: number;
  status: 'Active' | 'Inactive' | 'Pending';
  join_date?: string;
  notes?: string;
  gp_contact?: string;  
  created_at: string;
  updated_at: string;
};

export type DbLPTransaction = {
  id: string;
  lp_id: string;
  fund_id: string;
  date: string;
  amount: number;
  type: 'Capital Call' | 'Distribution' | 'Return of Capital';
  notes?: string;
  created_at: string;
};

export type DbCompany = {
  id: string;
  fund_id: string;
  name: string;
  sector?: string;
  legal_name?: string; 
  stage?: string;
  website?: string;
  status: 'Active' | 'Exited' | 'Written Off';
  entity_type?: string;
  jurisdiction?: string;
  us_state?: string;
  country?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  security_type?: string;
  round?: string;
  valuation?: number;
  valuation_type?: string;
  investment_date?: string;
  headline?: string;
  about?: string;
  notes?: string;   
  invested: number;
  unrealised: number;
  distributions: number;
  moic: number;
  irr: number;
  created_at: string;
  updated_at: string;
};

export type DbTransaction = {
  id: string;
  fund_id: string;
  company_id?: string;
  company_name: string;
  date: string;
  type: 'Investment' | 'Distribution' | 'Exit' | 'Fee' | 'Other';
  amount: number;
  instrument: 'Equity' | 'Convertible Note' | 'SAFE' | 'Preferred Stock' | 'Other';
  description?: string;
  notes?: string;
  discount_pct?: number;
  valuation_cap?: number;
  created_at: string;
};

export type DbExpense = {
  id: string;
  fund_id: string;
  date: string;
  quarter: string;
  quarter_end: string;
  type: 'Management Fee' | 'Legal' | 'Audit' | 'Admin' | 'Other';
  amount: number;
  description?: string;
  notes?: string;
  created_at: string;
};

export type DbValuation = {
  id: string;
  company_id: string;
  fund_id: string;
  transaction_id?: string;
  quarter: string;
  quarter_end: string;
  value: number;
  moic?: number;
  irr?: number;
  round?: string;
  notes?: string;
  company_value?: number;
  created_at: string;
};

export type DbCompanyUpdate = {
  id: string;
  company_id: string;
  date: string;
  title: string;
  body?: string;
  is_public: boolean;
  created_by?: string;
  created_at: string;
};


// ─── FUND MEMBERS ─────────────────────────────────────────────

export type FundMemberRole = 'GP' | 'Associate' | 'Analyst' | 'Finance' | 'LP Manager' | 'Viewer';

export type DbFundMember = {
  id: string;
  fund_id: string;
  name: string;
  email?: string;
  role: FundMemberRole;
  title?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

// ─── FUNDS ───────────────────────────────────────────────────

export async function getFunds(): Promise<DbFund[]> {
  const { data, error } = await supabase
    .from('funds')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getFundById(id: string): Promise<DbFund | null> {
  const { data, error } = await supabase
    .from('funds')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createFund(fund: Omit<DbFund, 'id' | 'created_at' | 'updated_at'>): Promise<DbFund> {
  const { data, error } = await supabase
    .from('funds')
    .insert(fund)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFund(id: string, updates: Partial<DbFund>): Promise<DbFund> {
  const { data, error } = await supabase
    .from('funds')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFund(id: string): Promise<void> {
  const { error } = await supabase.from('funds').delete().eq('id', id);
  if (error) throw error;
}

// ─── LPs ─────────────────────────────────────────────────────

export async function getLPsByFund(fundId: string): Promise<DbLP[]> {
  const { data, error } = await supabase
    .from('lps')
    .select('*')
    .eq('fund_id', fundId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getLPById(id: string): Promise<DbLP | null> {
  const { data, error } = await supabase
    .from('lps')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createLP(lp: Omit<DbLP, 'id' | 'created_at' | 'updated_at'>): Promise<DbLP> {
  const { data, error } = await supabase
    .from('lps')
    .insert(lp)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateLP(id: string, updates: Partial<DbLP>): Promise<DbLP> {
  const { data, error } = await supabase
    .from('lps')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLP(id: string): Promise<void> {
  const { error } = await supabase.from('lps').delete().eq('id', id);
  if (error) throw error;
}

// ─── LP TRANSACTIONS ─────────────────────────────────────────

export async function getLPTransactions(lpId: string): Promise<DbLPTransaction[]> {
  const { data, error } = await supabase
    .from('lp_transactions')
    .select('*')
    .eq('lp_id', lpId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getLPTransactionsByFund(fundId: string): Promise<DbLPTransaction[]> {
  const { data, error } = await supabase
    .from('lp_transactions')
    .select('*')
    .eq('fund_id', fundId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addLPTransaction(
  txn: Omit<DbLPTransaction, 'id' | 'created_at'>
): Promise<DbLPTransaction> {
  const { data, error } = await supabase
    .from('lp_transactions')
    .insert(txn)
    .select()
    .single();
  if (error) throw error;

  // Update LP called total
  const allTxns = await getLPTransactions(txn.lp_id);
  const totalCalled = allTxns.reduce((s, t) => s + t.amount, 0);
  await updateLP(txn.lp_id, { called: totalCalled });

  return data;
}

export async function deleteLPTransaction(id: string, lpId: string): Promise<void> {
  const { error } = await supabase.from('lp_transactions').delete().eq('id', id);
  if (error) throw error;
  // Recalculate LP called total
  const allTxns = await getLPTransactions(lpId);
  const totalCalled = allTxns.reduce((s, t) => s + t.amount, 0);
  await updateLP(lpId, { called: totalCalled });
}

// ─── COMPANIES ───────────────────────────────────────────────

export async function getCompaniesByFund(fundId: string): Promise<DbCompany[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('fund_id', fundId)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getCompanyById(id: string): Promise<DbCompany | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

export async function createCompany(
  company: Omit<DbCompany, 'id' | 'created_at' | 'updated_at'>
): Promise<DbCompany> {
  const { data, error } = await supabase
    .from('companies')
    .insert(company)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCompany(id: string, updates: Partial<DbCompany>): Promise<DbCompany> {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  // Keep denormalized company_name in transactions in sync when name changes
  if (updates.name) {
    await supabase.from('transactions').update({ company_name: updates.name }).eq('company_id', id);
  }
  return data;
}

export async function deleteCompany(id: string): Promise<void> {
  const { error } = await supabase.from('companies').delete().eq('id', id);
  if (error) throw error;
}

// ─── TRANSACTIONS ─────────────────────────────────────────────

export async function getTransactionsByFund(fundId: string): Promise<DbTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('fund_id', fundId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTransactionsByCompany(companyId: string): Promise<DbTransaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTransaction(
  txn: Omit<DbTransaction, 'id' | 'created_at'>
): Promise<DbTransaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(txn)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTransaction(
  id: string,
  updates: Partial<DbTransaction>
): Promise<DbTransaction> {
  const { data, error } = await supabase
    .from('transactions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
}

// ─── EXPENSES ────────────────────────────────────────────────

export async function getExpensesByFund(fundId: string): Promise<DbExpense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('fund_id', fundId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createExpense(
  expense: Omit<DbExpense, 'id' | 'created_at'>
): Promise<DbExpense> {
  const { data, error } = await supabase
    .from('expenses')
    .insert(expense)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExpense(id: string, updates: Partial<DbExpense>): Promise<DbExpense> {
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ─── VALUATIONS ──────────────────────────────────────────────

export async function getValuationsByCompany(companyId: string): Promise<DbValuation[]> {
  const { data, error } = await supabase
    .from('valuations')
    .select('*')
    .eq('company_id', companyId)
    .order('quarter_end', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getValuationsByFund(fundId: string): Promise<DbValuation[]> {
  const { data, error } = await supabase
    .from('valuations')
    .select('*')
    .eq('fund_id', fundId)
    .order('quarter_end', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function upsertValuation(
  valuation: Omit<DbValuation, 'id' | 'created_at'>
): Promise<DbValuation> {
  // Use transaction_id+quarter conflict when transaction_id is present
  // Fall back to company_id+quarter for legacy rows
  const conflictKey = valuation.transaction_id
    ? 'transaction_id,quarter'
    : 'company_id,quarter';
  const { data, error } = await supabase
    .from('valuations')
    .upsert(valuation, { onConflict: conflictKey })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── COMPANY UPDATES ─────────────────────────────────────────

export async function getCompanyUpdates(companyId: string): Promise<DbCompanyUpdate[]> {
  const { data, error } = await supabase
    .from('company_updates')
    .select('*')
    .eq('company_id', companyId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createCompanyUpdate(
  update: Omit<DbCompanyUpdate, 'id' | 'created_at'>
): Promise<DbCompanyUpdate> {
  const { data, error } = await supabase
    .from('company_updates')
    .insert(update)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCompanyUpdate(id: string): Promise<void> {
  const { error } = await supabase.from('company_updates').delete().eq('id', id);
  if (error) throw error;
}


// ─── FUND MEMBERS ─────────────────────────────────────────────

export async function getFundMembers(fundId: string): Promise<DbFundMember[]> {
  const { data, error } = await supabase
    .from('fund_members')
    .select('*')
    .eq('fund_id', fundId)
    .eq('is_active', true)
    .order('role')
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function getFundMembersByRole(fundId: string, role: FundMemberRole): Promise<DbFundMember[]> {
  const { data, error } = await supabase
    .from('fund_members')
    .select('*')
    .eq('fund_id', fundId)
    .eq('role', role)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createFundMember(
  member: Omit<DbFundMember, 'id' | 'created_at' | 'updated_at'>
): Promise<DbFundMember> {
  const { data, error } = await supabase
    .from('fund_members')
    .insert(member)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFundMember(
  id: string,
  updates: Partial<Pick<DbFundMember, 'name' | 'email' | 'role' | 'title' | 'is_active'>>
): Promise<DbFundMember> {
  const { data, error } = await supabase
    .from('fund_members')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFundMember(id: string): Promise<void> {
  // Soft-delete: mark inactive rather than hard delete to preserve audit trail
  const { error } = await supabase
    .from('fund_members')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

// ─── HELPERS ─────────────────────────────────────────────────

// Recalculate fund totals from transactions and LP data
export async function recalculateFundMetrics(fundId: string): Promise<void> {
  const [txns, lps] = await Promise.all([
    getTransactionsByFund(fundId),
    getLPsByFund(fundId),
  ]);

  const invested     = txns.filter(t => t.type === 'Investment').reduce((s, t) => s + t.amount, 0);
  const distributions = txns.filter(t => t.type === 'Distribution').reduce((s, t) => s + t.amount, 0);
  const committed    = lps.reduce((s, lp) => s + lp.commitment, 0);
  const called       = lps.reduce((s, lp) => s + lp.called, 0);

  await updateFund(fundId, { invested, distributions, committed, called });
}
