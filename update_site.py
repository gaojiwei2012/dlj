from pathlib import Path
import re

root = Path('/opt/douliuji-test/douliuji-test')
app = root / 'src/App.vue'
css = root / 'src/styles.css'
server = root / 'server/index.mjs'
seats = root / 'server/services/seat-reservations.mjs'
migrations = root / 'server/migrations/index.mjs'

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)

s = app.read_text()
# Keep the links in the existing account card; remove their separate heading and card.
doc_pattern = r'<section v-if="tab===\x27account\x27" class="admin-card account-docs"><h2>文档</h2>.*?</section>'
s, n = re.subn(doc_pattern, '', s, count=1)
if n != 1:
    raise RuntimeError(f'document card: {n} matches')
account_start = s.index('<section v-if="tab===\x27account\x27" class="admin-card account-card">')
account_end = s.index('</section>', account_start)
links = '<div class="account-doc-links"><a href="/docs/version.html">版本说明 <span aria-hidden="true">›</span></a><a href="/docs/guide.html">使用说明 <span aria-hidden="true">›</span></a></div>'
s = s[:account_end] + links + s[account_end:]

s = replace_once(s, '<p v-if="!courses.length" class="empty-card">管理员还没有发布课程安排</p></section></template>', '<p v-if="!courses.length" class="empty-card">管理员还没有发布课程安排</p><p class="course-note">课程信息供日常查询使用。如有调课、时间或地点变动，请以学校正式通知为准。</p></section></template>', 'course note')
s = replace_once(s, '<h3>{{s.title}}</h3><p>地点：{{s.location||\x27未填写\x27}}</p>', '<h3>{{s.title}}</h3><p v-if="s.instructor">导师：{{s.instructor}}</p><p>地点：{{s.location||\x27未填写\x27}}</p>', 'student instructor')
s = replace_once(s, 'location:x.location,startAt:x.start_at,endAt:x.end_at', 'location:x.location,instructor:x.instructor||\x27\x27,startAt:x.start_at,endAt:x.end_at', 'edit instructor')
s = replace_once(s, '<label>上课地点<input v-model="courseForm.location"></label>', '<label>上课地点<input v-model="courseForm.location"></label><label>导师信息<input v-model="courseForm.instructor" maxlength="80" placeholder="选填"/></label>', 'admin instructor input')
s = replace_once(s, "{{x.location||'未填写地点'}}", "{{x.location||'未填写地点'}}<small v-if='x.instructor'> · 导师：{{x.instructor}}</small>", 'admin instructor display')
s = replace_once(s, "if(confirm('确定删除这条计划吗？'))", "if(confirm((plans.value.find(p=>p.id===id)?.active_reservations||0)>0?'该计划已有预约。请先与预约人线下沟通；删除后这些预约会取消。确定删除？':'确定删除这条计划吗？'))", 'delete confirmation')
app.write_text(s)

style = css.read_text()
style += '''
/* Integrated account documents and course note */
.account-doc-links{margin-top:22px;border-top:1px solid #dce7e3}
.account-doc-links a{display:flex;justify-content:space-between;align-items:center;padding:16px 4px;color:#0d736b;text-decoration:none;font-weight:600}
.account-doc-links a+a{border-top:1px solid #dce7e3}
.account-doc-links a span{font-size:24px;line-height:1}
.course-note{margin:22px 4px 12px;color:#748782;font-size:.9rem;line-height:1.6}
'''
css.write_text(style)

s = seats.read_text()
s = replace_once(s,
    "if (!isPublic || transport !== '自驾' || !hasSeats) {\n    throw new SeatReservationError(409, `已有 ${activeReservations} 个有效预约，不能取消公开或关闭自驾座位`)\n  }",
    "if (!isPublic) return { activeReservations, remainingSeats: Number(oldPlan.seat_count || 0) }\n  if (transport !== '自驾' || !hasSeats) {\n    throw new SeatReservationError(409, `已有 ${activeReservations} 个有效预约，不能关闭自驾座位；可先取消公开，保留已有预约`)\n  }",
    'allow unpublish')
# A current passenger can still see their booking and contact after unpublishing.
s = replace_once(s, "WHERE tp.is_public=1 AND tp.status='ACTIVE'", "WHERE (tp.is_public=1 OR EXISTS (SELECT 1 FROM travel_seat_reservations tr WHERE tr.travel_plan_id=tp.id AND tr.user_id=? AND tr.status='RESERVED')) AND tp.status='ACTIVE'", 'booked plan visibility')
s = replace_once(s, ").all(today)", ").all(userId,today)", 'companion query binding')
seats.write_text(s)

s = server.read_text()
s = replace_once(s, "const seatState=validatePlanSeatChange(db,fresh,{isPublic,transport,hasSeats,seatCapacity})", "const seatState=validatePlanSeatChange(db,fresh,{isPublic,transport,hasSeats,seatCapacity});const keepBookedSeat=!isPublic&&seatState.activeReservations>0", 'keep existing seats')
s = replace_once(s, "try{assertPlanCanDelete(db,old.id);db.prepare(", "try{db.prepare(\"UPDATE travel_seat_reservations SET status='CANCELLED',cancelled_at=? WHERE travel_plan_id=? AND status='RESERVED'\").run(new Date().toISOString(),old.id);db.prepare(", 'cancel reservations on delete')
s = replace_once(s, "isPublic?1:0,isPublic?String(x.city).trim():null,transport,hasSeats?1:0,seatState.remainingSeats,seatCapacity,contactType,contactValue,old.id)", "isPublic?1:0,keepBookedSeat?fresh.city:(isPublic?String(x.city).trim():null),keepBookedSeat?fresh.transport:transport,keepBookedSeat?fresh.has_seats:(hasSeats?1:0),keepBookedSeat?fresh.seat_count:seatState.remainingSeats,keepBookedSeat?fresh.seat_capacity:seatCapacity,keepBookedSeat?fresh.contact_type:contactType,keepBookedSeat?fresh.contact_value:contactValue,old.id)", 'preserve booked details')
# Course storage.
s = replace_once(s, "course_sessions(academic_year_id,title,location,start_at,end_at,status,sort_order) VALUES(?,?,?,?,?,'ACTIVE',?)", "course_sessions(academic_year_id,title,location,instructor,start_at,end_at,status,sort_order) VALUES(?,?,?,?,?,?,'ACTIVE',?)", 'course insert SQL')
s = replace_once(s, "String(x.title).trim(),String(x.location).trim(),x.startAt,x.endAt,Number(x.sortOrder||0)", "String(x.title).trim(),String(x.location).trim(),String(x.instructor||'').trim().slice(0,80),x.startAt,x.endAt,Number(x.sortOrder||0)", 'course insert values')
s = replace_once(s, "UPDATE course_sessions SET title=?,location=?,start_at=?,end_at=? WHERE id=?", "UPDATE course_sessions SET title=?,location=?,instructor=?,start_at=?,end_at=? WHERE id=?", 'course update SQL')
s = replace_once(s, "String(x.title).trim(),String(x.location).trim(),x.startAt,x.endAt,old.id", "String(x.title).trim(),String(x.location).trim(),String(x.instructor||'').trim().slice(0,80),x.startAt,x.endAt,old.id", 'course update values')
server.write_text(s)

s = migrations.read_text()
needle = '\n]\n\nexport const SCHEMA_VERSION'
extra = "\n  ,database => {\n    const cols = new Set(database.prepare('PRAGMA table_info(course_sessions)').all().map(c => c.name))\n    if (!cols.has('instructor')) database.exec(\"ALTER TABLE course_sessions ADD COLUMN instructor TEXT NOT NULL DEFAULT ''\")\n  }\n]\n\nexport const SCHEMA_VERSION"
s = replace_once(s, needle, extra, 'course migration')
migrations.write_text(s)
print('PATCH_OK')
