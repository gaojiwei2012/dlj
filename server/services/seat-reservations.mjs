export class SeatReservationError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'SeatReservationError'
    this.status = status
  }
}

const activeCountStatement = database => database.prepare("SELECT COUNT(*) count FROM travel_seat_reservations WHERE travel_plan_id=? AND status='RESERVED'")

export function activeReservationCount(database, planId) {
  return Number(activeCountStatement(database).get(planId)?.count || 0)
}

export function decorateOwnedPlans(database, plans) {
  const count = activeCountStatement(database)
  return plans.map(plan => {
    const activeReservations = Number(count.get(plan.id)?.count || 0)
    const totalSeats = plan.seat_capacity == null ? (plan.seat_count == null ? null : Number(plan.seat_count) + activeReservations) : Number(plan.seat_capacity)
    const remainingSeats = plan.has_seats ? Math.max(0, Number(plan.seat_count || 0)) : null
    return {
      ...plan,
      seat_capacity: totalSeats,
      remaining_seats: remainingSeats,
      active_reservations: activeReservations
    }
  })
}

export function listCompanions(database, userId, today) {
  const plans = database.prepare(`
    SELECT tp.id,tp.user_id owner_id,tp.depart_date,tp.return_date,tp.city,tp.transport,
           tp.has_seats,tp.seat_count,tp.seat_capacity,tp.contact_type,tp.contact_value,
           u.display_name
      FROM travel_plans tp
      JOIN users u ON u.id=tp.user_id
     WHERE (tp.is_public=1 OR EXISTS (SELECT 1 FROM travel_seat_reservations tr WHERE tr.travel_plan_id=tp.id AND tr.user_id=? AND tr.status='RESERVED')) AND tp.status='ACTIVE' AND tp.return_date>=? AND u.status='ACTIVE'
     ORDER BY tp.depart_date,tp.city,u.display_name
  `).all(userId,today)
  const reservedByMe = database.prepare("SELECT id FROM travel_seat_reservations WHERE travel_plan_id=? AND user_id=? AND status='RESERVED' LIMIT 1")
  const activeCount = activeCountStatement(database)
  return plans.map(plan => {
    const isOwner = Number(plan.owner_id) === Number(userId)
    const reservation = reservedByMe.get(plan.id, userId)
    const isReservedByMe = Boolean(reservation)
    const activeReservations = Number(activeCount.get(plan.id)?.count || 0)
    const totalSeats = plan.seat_capacity == null ? (plan.seat_count == null ? null : Number(plan.seat_count) + activeReservations) : Number(plan.seat_capacity)
    const remainingSeats = plan.has_seats ? Math.max(0, Number(plan.seat_count || 0)) : null
    const hasContact = Boolean(String(plan.contact_type || '').trim() && String(plan.contact_value || '').trim())
    const reservableType = plan.transport === '自驾' && Boolean(plan.has_seats)
    const item = {
      id: plan.id,
      owner_id: plan.owner_id,
      depart_date: plan.depart_date,
      return_date: plan.return_date,
      city: plan.city,
      transport: plan.transport,
      has_seats: plan.has_seats,
      seat_count: remainingSeats,
      seat_capacity: totalSeats,
      remaining_seats: remainingSeats,
      display_name: plan.display_name,
      is_owner: isOwner,
      is_reserved_by_me: isReservedByMe,
      is_full: reservableType && remainingSeats <= 0,
      can_reserve: reservableType && !isOwner && !isReservedByMe && remainingSeats > 0 && hasContact
    }
    if (isOwner || isReservedByMe) item.contact = { type: plan.contact_type, value: plan.contact_value }
    if (reservableType && !hasContact) item.reservation_unavailable_reason = '发布者尚未填写联系方式'
    return item
  })
}

function loadReservablePlan(database, planId, today) {
  return database.prepare(`
    SELECT tp.*,u.status owner_status
      FROM travel_plans tp JOIN users u ON u.id=tp.user_id
     WHERE tp.id=?
  `).get(planId)
}

export function reserveSeat(database, planId, userId, today, now = new Date().toISOString()) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const plan = loadReservablePlan(database, planId, today)
    if (!plan || plan.status !== 'ACTIVE' || !plan.is_public || plan.owner_status !== 'ACTIVE' || plan.return_date < today) throw new SeatReservationError(404, '公开计划不存在或已失效')
    if (Number(plan.user_id) === Number(userId)) throw new SeatReservationError(400, '不能预约自己的座位')
    if (plan.transport !== '自驾' || !plan.has_seats) throw new SeatReservationError(400, '该计划不提供可预约座位')
    if (!String(plan.contact_type || '').trim() || !String(plan.contact_value || '').trim()) throw new SeatReservationError(409, '发布者尚未填写联系方式，暂不能预约')
    if (database.prepare("SELECT id FROM travel_seat_reservations WHERE travel_plan_id=? AND user_id=? AND status='RESERVED'").get(plan.id, userId)) throw new SeatReservationError(409, '你已经预约过该计划')
    const seat = database.prepare("UPDATE travel_plans SET seat_count=seat_count-1 WHERE id=? AND seat_count>0 AND status='ACTIVE' AND is_public=1").run(plan.id)
    if (!Number(seat.changes)) throw new SeatReservationError(409, '座位已满')
    const r = database.prepare("INSERT INTO travel_seat_reservations(travel_plan_id,user_id,status,created_at) VALUES(?,?,'RESERVED',?)").run(plan.id, userId, now)
    const updated = database.prepare('SELECT seat_count,seat_capacity,contact_type,contact_value FROM travel_plans WHERE id=?').get(plan.id)
    database.exec('COMMIT')
    return {
      reservationId: Number(r.lastInsertRowid),
      status: 'RESERVED',
      remainingSeats: Number(updated.seat_count),
      totalSeats: Number(updated.seat_capacity ?? (Number(updated.seat_count) + 1)),
      contact: { type: updated.contact_type, value: updated.contact_value }
    }
  } catch (error) {
    database.exec('ROLLBACK')
    if (error instanceof SeatReservationError) throw error
    if (String(error?.message || '').includes('UNIQUE constraint failed')) throw new SeatReservationError(409, '你已经预约过该计划')
    throw error
  }
}

export function cancelSeatReservation(database, planId, userId, now = new Date().toISOString()) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const reservation = database.prepare("SELECT * FROM travel_seat_reservations WHERE travel_plan_id=? AND user_id=? AND status='RESERVED' ORDER BY id DESC LIMIT 1").get(planId, userId)
    if (!reservation) throw new SeatReservationError(409, '当前没有可取消的有效预约')
    const plan = database.prepare('SELECT id,seat_count,seat_capacity FROM travel_plans WHERE id=?').get(planId)
    if (!plan) throw new SeatReservationError(404, '计划不存在')
    const changed = database.prepare("UPDATE travel_seat_reservations SET status='CANCELLED',cancelled_at=? WHERE id=? AND status='RESERVED'").run(now, reservation.id)
    if (!Number(changed.changes)) throw new SeatReservationError(409, '该预约已经取消')
    database.prepare('UPDATE travel_plans SET seat_count=MIN(COALESCE(seat_capacity,seat_count+1),seat_count+1) WHERE id=?').run(planId)
    const updated = database.prepare('SELECT seat_count,seat_capacity FROM travel_plans WHERE id=?').get(planId)
    database.exec('COMMIT')
    return { status: 'CANCELLED', remainingSeats: Number(updated.seat_count), totalSeats: Number(updated.seat_capacity ?? updated.seat_count) }
  } catch (error) {
    database.exec('ROLLBACK')
    if (error instanceof SeatReservationError) throw error
    throw error
  }
}

export function validatePlanSeatChange(database, oldPlan, { isPublic, transport, hasSeats, seatCapacity }) {
  const activeReservations = activeReservationCount(database, oldPlan.id)
  if (!activeReservations) return { activeReservations, remainingSeats: hasSeats ? seatCapacity : null }
  if (!isPublic) return { activeReservations, remainingSeats: Number(oldPlan.seat_count || 0) }
  if (transport !== '自驾' || !hasSeats) {
    throw new SeatReservationError(409, `已有 ${activeReservations} 个有效预约，不能关闭自驾座位；可先取消公开，保留已有预约`)
  }
  if (seatCapacity < activeReservations) {
    throw new SeatReservationError(409, `已有 ${activeReservations} 个有效预约，可预约座位总数不能低于该数量`)
  }
  return { activeReservations, remainingSeats: seatCapacity - activeReservations }
}

export function assertPlanCanDelete(database, planId) {
  const activeReservations = activeReservationCount(database, planId)
  if (activeReservations) throw new SeatReservationError(409, `已有 ${activeReservations} 个有效预约，不能删除该计划`)
}
