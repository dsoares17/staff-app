import { supabase } from './supabaseClient.js'

// payload matches JobForm's onSubmit shape:
// { recurring, dateEntries, jobData, expectedAmount }
export async function createJobFromPayload(userId, payload) {
  if (!userId) throw new Error('Utilizador não autenticado.')

  if (payload.recurring) {
    const seriesId = crypto.randomUUID()
    const failures = []
    let successCount = 0

    for (const entry of payload.dateEntries) {
      try {
        const { data: job, error: jobError } = await supabase
          .from('staff_app_jobs')
          .insert({
            staff_app_user_id: userId,
            status: 'confirmed',
            ...payload.jobData,
            start_date: entry.startDate,
            end_date: entry.endDate,
            series_id: seriesId,
          })
          .select('id')
          .single()
        if (jobError) throw jobError

        const { error: paymentError } = await supabase.from('staff_app_payments').insert({
          staff_app_user_id: userId,
          job_id: job.id,
          status: 'por_faturar',
          expected_amount: payload.expectedAmount,
        })
        if (paymentError) throw paymentError

        successCount += 1
      } catch (err) {
        const label = entry.endDate
          ? `${entry.startDate} — ${entry.endDate}`
          : entry.startDate
        failures.push(`${label}: ${err.message || 'erro desconhecido'}`)
      }
    }

    return { recurring: true, successCount, failures, total: payload.dateEntries.length }
  }

  const { jobData, expectedAmount } = payload
  const { data: job, error: jobError } = await supabase
    .from('staff_app_jobs')
    .insert({ staff_app_user_id: userId, status: 'confirmed', ...jobData })
    .select('id')
    .single()
  if (jobError) throw jobError

  const { error: paymentError } = await supabase.from('staff_app_payments').insert({
    staff_app_user_id: userId,
    job_id: job.id,
    status: 'por_faturar',
    expected_amount: expectedAmount,
  })
  if (paymentError) throw paymentError

  return { recurring: false, successCount: 1, failures: [], total: 1, jobId: job.id }
}
