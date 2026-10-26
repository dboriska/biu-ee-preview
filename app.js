/**
 * BIU Engineering Student Advising & Curriculum Simulation Dashboard (תשפ"ז)
 */

let appData = null;
let selectedCourseCode = null;
let isSidebarOpen = false; // Off by default to maximize graph space
let appMode = localStorage.getItem('biu_appMode') || 'normal'; // 'normal' | 'simulation'
let completedCourses = new Set();

// Normal mode custom placements for multi-semester courses: { [programName]: { [courseCode]: semInt } }
let normalPlacements = {};

// Simulation mode manual delays: { [programName]: { [courseCode]: semInt } }
let simManualDelays = {};

// Extra simulation columns added by user
let extraSimColumns = 2;

// Drag state
let dragState = null;

// Uploaded Student Grade Sheet Data & Filter State
let studentGradesData = null;
let studentGradesByCode = {};
let gradesShowOnlyGraded = true; // Default V checked: show only rows/courses with a grade

function rebuildGradesByCodeMap() {
    studentGradesByCode = {};
    if (studentGradesData && Array.isArray(studentGradesData.courses)) {
        studentGradesData.courses.forEach(c => {
            studentGradesByCode[c.course_code] = c;
        });
    }
}

// Load persisted state from localStorage
try {
    const savedCompleted = localStorage.getItem('completedCourses');
    if (savedCompleted) {
        const parsed = JSON.parse(savedCompleted);
        if (Array.isArray(parsed)) completedCourses = new Set(parsed);
    }
    const savedNormal = localStorage.getItem('biu_normalPlacements');
    if (savedNormal) normalPlacements = JSON.parse(savedNormal) || {};

    const savedSim = localStorage.getItem('biu_simManualDelays');
    if (savedSim) simManualDelays = JSON.parse(savedSim) || {};

    const savedGrades = localStorage.getItem('biu_studentGradesData');
    if (savedGrades) {
        studentGradesData = JSON.parse(savedGrades);
        rebuildGradesByCodeMap();
    }
} catch (e) {
    console.error("Failed loading saved state from localStorage:", e);
}

function savePlacementsState() {
    try {
        localStorage.setItem('biu_normalPlacements', JSON.stringify(normalPlacements));
        localStorage.setItem('biu_simManualDelays', JSON.stringify(simManualDelays));
    } catch (e) {
        console.error("Failed saving placements:", e);
    }
}

function setStatus(msg, isError = false) {
    const el = document.getElementById('status-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.background = isError ? 'rgba(220, 38, 38, 0.85)' : 'rgba(255, 255, 255, 0.16)';
    el.style.color = '#fff';
}

function getCurrentProgramName() {
    const sel = document.getElementById('program-select');
    return sel ? sel.value : '';
}

function getCurrentProgram() {
    const name = getCurrentProgramName();
    if (!appData || !appData.programs) return null;
    return appData.programs.find(p => p.program_name === name) || null;
}

function getSelectedTracks() {
    return Array.from(document.querySelectorAll('.track-toggle.active')).map(b => b.dataset.track);
}

function isFreeParityEnabled() {
    const cb = document.getElementById('sim-free-parity');
    return cb ? cb.checked : false;
}

function setAppMode(mode) {
    appMode = mode === 'simulation' ? 'simulation' : 'normal';
    localStorage.setItem('biu_appMode', appMode);

    const btnNormal = document.getElementById('btn-mode-normal');
    const btnSim = document.getElementById('btn-mode-sim');
    const simBanner = document.getElementById('simulation-banner');
    const simLegends = document.querySelectorAll('.sim-only-legend');

    if (btnNormal) btnNormal.classList.toggle('active', appMode === 'normal');
    if (btnSim) btnSim.classList.toggle('active', appMode === 'simulation');
    if (simBanner) simBanner.style.display = appMode === 'simulation' ? 'flex' : 'none';
    simLegends.forEach(el => {
        el.style.display = appMode === 'simulation' ? 'inline-flex' : 'none';
    });

    renderAll();
    if (selectedCourseCode) {
        showDetails(selectedCourseCode, false);
    }
}

function onSimParityChange() {
    localStorage.setItem('biu_simFreeParity', isFreeParityEnabled() ? '1' : '0');
    renderAll();
    if (selectedCourseCode) showDetails(selectedCourseCode, false);
}

function addSimulationSemesterColumns() {
    extraSimColumns = Math.min(extraSimColumns + 2, 8);
    renderAll();
}

function resetSimulation() {
    const progName = getCurrentProgramName();
    if (progName && simManualDelays[progName]) {
        delete simManualDelays[progName];
        savePlacementsState();
    }
    extraSimColumns = 2;
    renderAll();
    if (selectedCourseCode) showDetails(selectedCourseCode, false);
    setStatus('הסימולציה אופסה לסמסטרים המקוריים');
}

function resetCurrentModePlacements() {
    const progName = getCurrentProgramName();
    if (!progName) return;
    if (appMode === 'simulation') {
        resetSimulation();
    } else {
        delete normalPlacements[progName];
        savePlacementsState();
        renderAll();
        if (selectedCourseCode) showDetails(selectedCourseCode, false);
        setStatus('מיקומי הקורסים הגמישים אופסו לברירת המחדל');
    }
}

function onFilterChange() {
    renderAll();
}

function clearSearch() {
    const input = document.getElementById('course-search');
    const clearBtn = document.getElementById('clear-search-btn');
    if (input) input.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    renderAll();
}

function updateSidebarToggleButton() {
    const toggleBtn = document.getElementById('toggle-sidebar-btn');
    const toolbarClearBtn = document.getElementById('toolbar-clear-selection-btn');
    const searchVal = document.getElementById('course-search')?.value?.trim() || '';

    if (toolbarClearBtn) {
        const hasActiveSelection = Boolean(selectedCourseCode || searchVal || completedCourses.size > 0);
        toolbarClearBtn.classList.toggle('has-selection', hasActiveSelection);
        toolbarClearBtn.style.opacity = hasActiveSelection ? '1' : '0.75';
        toolbarClearBtn.innerHTML = completedCourses.size > 0
            ? `🧹 נקה בחירה (${completedCourses.size})`
            : `🧹 נקה בחירה`;
    }

    if (!toggleBtn) return;
    toggleBtn.classList.toggle('active', isSidebarOpen);
    if (isSidebarOpen) {
        toggleBtn.innerHTML = 'ℹ️ הסתר פרטים ✕';
    } else if (selectedCourseCode && appData?.courses?.[selectedCourseCode]) {
        const nm = appData.courses[selectedCourseCode].name_he;
        const shortNm = nm.length > 14 ? nm.substring(0, 13) + '…' : nm;
        toggleBtn.innerHTML = `ℹ️ פרטי קורס: ${selectedCourseCode} (${shortNm})`;
    } else {
        toggleBtn.innerHTML = 'ℹ️ פרטי קורס';
    }
}

function toggleDetailsSidebar(forceState = null) {
    isSidebarOpen = typeof forceState === 'boolean' ? forceState : !isSidebarOpen;
    const details = document.getElementById('details');
    const resizer = document.getElementById('resizer');

    if (details) details.style.display = isSidebarOpen ? 'flex' : 'none';
    if (resizer) resizer.style.display = isSidebarOpen ? 'block' : 'none';
    updateSidebarToggleButton();
    renderAll();
}

function clearSelectedCourse() {
    selectedCourseCode = null;
    const clearBtn = document.getElementById('clear-selection-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    const detailsContent = document.getElementById('details-content');
    if (detailsContent) {
        detailsContent.innerHTML = `
            <div class="empty-details-placeholder">
                <div class="placeholder-icon">👆</div>
                <p><strong>בחר קורס במפה או ברשימה</strong> כדי לצפות בדרישות הקדם, קורסים חופפים, קורסי המשך ואפשרויות הזזה בין סמסטרים.</p>
            </div>
        `;
    }
    updateSidebarToggleButton();
    renderAll();
}

function clearAllSelections() {
    selectedCourseCode = null;
    completedCourses.clear();
    studentGradesData = null;
    studentGradesByCode = {};
    try {
        localStorage.removeItem('completedCourses');
        localStorage.removeItem('biu_studentGradesData');
    } catch (e) {
        console.error("Failed clearing completedCourses:", e);
    }

    const clearBtn = document.getElementById('clear-selection-btn');
    if (clearBtn) clearBtn.style.display = 'none';

    const input = document.getElementById('course-search');
    const clearSearchBtn = document.getElementById('clear-search-btn');
    if (input) input.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    const detailsContent = document.getElementById('details-content');
    if (detailsContent) {
        detailsContent.innerHTML = `
            <div class="empty-details-placeholder">
                <div class="placeholder-icon">👆</div>
                <p><strong>בחר קורס במפה או ברשימה</strong> כדי לצפות בדרישות הקדם, קורסים חופפים, קורסי המשך ואפשרויות הזזה בין סמסטרים.</p>
            </div>
        `;
    }
    updateSidebarToggleButton();
    renderAll();
    setStatus('נוקו כל הקורסים המסומנים, נקודות הזכות והחיפוש');
}

/**
 * Filter and deduplicate courses for the active program + selected tracks + category toggles.
 */
function getActiveProgramCourses(program, activeTracks) {
    if (!program) return [];
    const showElectives = document.getElementById('toggle-electives')
        ? document.getElementById('toggle-electives').checked
        : true;
    const showNotOffered = document.getElementById('toggle-not-offered')
        ? document.getElementById('toggle-not-offered').checked
        : true;

    const rawFiltered = program.courses.filter(c => {
        const matchesTrack = c.track === 'ליבה' || activeTracks.includes(c.track);
        if (!matchesTrack) return false;
        if (!showElectives && c.category === 'בחירה') return false;
        if (!showNotOffered && c.not_offered_this_year) return false;
        return true;
    });

    const byCode = new Map();
    const catPriority = { 'חובה': 1, 'תשתית': 2, 'תשתית מומלץ': 3, 'חובה במסלול': 4, 'בחירה': 5, 'סדנה / שירות': 6 };

    rawFiltered.forEach(c => {
        const allowed = Array.isArray(c.allowed_semesters) && c.allowed_semesters.length > 0
            ? [...c.allowed_semesters]
            : [parseInt(c.semester) || 1];
        if (!byCode.has(c.course_code)) {
            byCode.set(c.course_code, {
                ...c,
                allowed_semesters: allowed.sort((a, b) => a - b),
                tracks_in_view: [c.track]
            });
        } else {
            const existing = byCode.get(c.course_code);
            const mergedSems = Array.from(new Set([...existing.allowed_semesters, ...allowed])).sort((a, b) => a - b);
            existing.allowed_semesters = mergedSems;
            existing.is_flexible_semester = mergedSems.length > 1;
            if (!existing.tracks_in_view.includes(c.track)) {
                existing.tracks_in_view.push(c.track);
            }
            if ((catPriority[c.category] || 9) < (catPriority[existing.category] || 9)) {
                existing.category = c.category;
                existing.track = c.track;
            }
        }
    });

    return Array.from(byCode.values()).map(c => {
        const baseDefault = c.allowed_semesters[0] || 1;
        return {
            ...c,
            default_semester: baseDefault,
            is_flexible_semester: c.allowed_semesters.length > 1
        };
    });
}

/**
 * Determine baseline semester for a course (including Normal Mode user placement for multi-semester courses).
 */
function getNormalSemester(programName, course) {
    const customMap = normalPlacements[programName] || {};
    const customSem = customMap[course.course_code];
    if (customSem && course.allowed_semesters.includes(customSem)) {
        return customSem;
    }
    return course.default_semester;
}

/**
 * Check if a course has both odd (Fall) and even (Spring) allowed semesters.
 */
function hasBothParities(course) {
    const sems = course.allowed_semesters || [course.default_semester];
    const hasOdd = sems.some(s => s % 2 === 1);
    const hasEven = sems.some(s => s % 2 === 0);
    return hasOdd && hasEven;
}

/**
 * Snap a candidate semester >= baseSem to a valid semester respecting parity rules.
 */
function snapSemesterForSimulation(candidateSem, baseSem, course, freeParity) {
    let s = Math.max(candidateSem, baseSem);
    if (freeParity || hasBothParities(course)) {
        return s;
    }
    if (s % 2 !== baseSem % 2) {
        s += 1;
    }
    return s;
}

/**
 * Compute effective semesters for all active courses in current mode (Normal or Simulation).
 * Returns a map: courseCode -> {
 *   semester: number,
 *   baseSemester: number,
 *   simStatus: 'none' | 'manual' | 'auto',
 *   causedBy: string | null,
 *   prereqConflict: string | null
 * }
 */
function computeEffectiveSchedule(program, activeCourses) {
    const progName = program.program_name;
    const schedule = {};
    const activeCodeSet = new Set(activeCourses.map(c => c.course_code));
    const courseObjMap = {};

    activeCourses.forEach(c => {
        courseObjMap[c.course_code] = c;
        const normSem = getNormalSemester(progName, c);
        schedule[c.course_code] = {
            semester: normSem,
            baseSemester: normSem,
            simStatus: 'none',
            causedBy: null,
            prereqConflict: null
        };
    });

    if (appMode === 'normal') {
        // In Normal Mode, check if any course is placed at or before one of its active prerequisites
        activeCourses.forEach(c => {
            const cSem = schedule[c.course_code].semester;
            const cInfo = appData.courses[c.course_code];
            if (!cInfo || !cInfo.prereq_groups) return;
            for (const grp of cInfo.prereq_groups) {
                const inView = grp.filter(p => activeCodeSet.has(p));
                if (inView.length > 0) {
                    const earliestPrereqSem = Math.min(...inView.map(p => schedule[p].semester));
                    if (earliestPrereqSem >= cSem) {
                        const conflictCode = inView.find(p => schedule[p].semester === earliestPrereqSem);
                        schedule[c.course_code].prereqConflict = conflictCode;
                        break;
                    }
                }
            }
        });
        return schedule;
    }

    // SIMULATION MODE: Apply manual delays + topological prerequisite cascade
    const manualMap = simManualDelays[progName] || {};
    const freeParity = isFreeParityEnabled();

    activeCourses.forEach(c => {
        const code = c.course_code;
        const baseSem = schedule[code].baseSemester;
        const manualTarget = manualMap[code];
        if (manualTarget && manualTarget > baseSem) {
            const snapped = snapSemesterForSimulation(manualTarget, baseSem, c, freeParity);
            schedule[code].semester = snapped;
            schedule[code].simStatus = 'manual';
        }
    });

    // Iterative relaxation over prerequisite DAG (converges in <= V iterations)
    const maxIterations = activeCourses.length + 2;
    for (let iter = 0; iter < maxIterations; iter++) {
        let changed = false;

        for (const c of activeCourses) {
            const code = c.course_code;
            const cInfo = appData.courses[code];
            if (!cInfo) continue;

            const baseSem = schedule[code].baseSemester;
            const manualTarget = manualMap[code] || baseSem;
            let minRequiredSem = Math.max(baseSem, manualTarget > baseSem ? snapSemesterForSimulation(manualTarget, baseSem, c, freeParity) : baseSem);
            let bottleneckPrereq = null;

            const groups = Array.isArray(cInfo.prereq_groups) && cInfo.prereq_groups.length > 0
                ? cInfo.prereq_groups
                : (cInfo.prerequisites || []).map(p => [p]);

            for (const grp of groups) {
                const inView = grp.filter(p => activeCodeSet.has(p));
                if (inView.length === 0) continue;

                // An OR-group is satisfied when the earliest course in the group is taken
                let bestP = inView[0];
                let bestSem = schedule[bestP].semester;
                for (const p of inView) {
                    if (schedule[p].semester < bestSem) {
                        bestSem = schedule[p].semester;
                        bestP = p;
                    }
                }

                // Dependent course must be taken in a semester strictly after bestP (bestSem + 1)
                const candidateAfterP = bestSem + 1;
                if (candidateAfterP > minRequiredSem) {
                    minRequiredSem = candidateAfterP;
                    bottleneckPrereq = bestP;
                }
            }

            const finalSem = snapSemesterForSimulation(minRequiredSem, baseSem, c, freeParity);
            if (finalSem !== schedule[code].semester) {
                schedule[code].semester = finalSem;
                if (bottleneckPrereq && (!manualMap[code] || finalSem > snapSemesterForSimulation(manualMap[code], baseSem, c, freeParity))) {
                    schedule[code].simStatus = 'auto';
                    schedule[code].causedBy = bottleneckPrereq;
                } else if (manualMap[code] && finalSem > baseSem) {
                    schedule[code].simStatus = 'manual';
                    schedule[code].causedBy = null;
                }
                changed = true;
            } else if (bottleneckPrereq && schedule[code].simStatus !== 'manual' && finalSem > baseSem) {
                schedule[code].simStatus = 'auto';
                schedule[code].causedBy = bottleneckPrereq;
            }
        }

        if (!changed) break;
    }

    return schedule;
}

/**
 * Update Simulation Banner metrics
 */
function updateSimulationBannerMetrics(activeCourses, schedule) {
    const container = document.getElementById('sim-metrics');
    if (!container || appMode !== 'simulation') return;

    let manualCount = 0;
    let autoCount = 0;
    let maxSem = 8;
    let baseMaxSem = 8;

    activeCourses.forEach(c => {
        const st = schedule[c.course_code];
        if (!st) return;
        if (st.baseSemester > baseMaxSem) baseMaxSem = st.baseSemester;
        if (st.semester > maxSem) maxSem = st.semester;
        if (st.simStatus === 'manual') manualCount++;
        else if (st.simStatus === 'auto') autoCount++;
    });

    const extraSems = Math.max(0, maxSem - baseMaxSem);
    const yearsTotal = (maxSem / 2).toFixed(1).replace('.0', '');

    container.innerHTML = `
        <span class="sim-metric-pill">📌 קורסים שנדחו ידנית: <strong>${manualCount}</strong></span>
        <span class="sim-metric-pill ${autoCount > 0 ? 'warn' : ''}">⛓️ קורסים שנדחו אוטומטית (שרשרת קדמים): <strong>${autoCount}</strong></span>
        <span class="sim-metric-pill ${extraSems > 0 ? 'warn' : ''}">
            ⏳ סיום לימודים משוער בסימולציה: <strong>סמסטר ${maxSem} (${yearsTotal} שנים)</strong>
            ${extraSems > 0 ? ` — התארכות של +${extraSems} סמסטרים!` : ' (ללא התארכות תואר)'}
        </span>
    `;
}

/**
 * Move a course to a target semester (called by mouse drag-and-drop or sidebar buttons)
 */
function moveCourseToSemester(courseCode, targetSemInt) {
    const program = getCurrentProgram();
    if (!program) return;
    const progName = program.program_name;
    const activeCourses = getActiveProgramCourses(program, getSelectedTracks());
    const course = activeCourses.find(c => c.course_code === courseCode);
    if (!course) return;

    if (appMode === 'normal') {
        if (!course.is_flexible_semester) {
            setStatus(`קורס ${courseCode} קבוע בסמסטר ${course.default_semester}. להזזתו עבור ל"מצב סימולציה" 🧪`, true);
            return;
        }
        if (!course.allowed_semesters.includes(targetSemInt)) {
            setStatus(`במצב רגיל ניתן להעביר את ${course.name_he} רק לסמסטרים המותרים שלו: ${course.allowed_semesters.join(', ')}`, true);
            return;
        }
        if (!normalPlacements[progName]) normalPlacements[progName] = {};
        if (targetSemInt === course.default_semester) {
            delete normalPlacements[progName][courseCode];
        } else {
            normalPlacements[progName][courseCode] = targetSemInt;
        }
        savePlacementsState();
        setStatus(`הקורס "${course.name_he}" (${courseCode}) הועבר לסמסטר ${targetSemInt}`);
    } else {
        // Simulation Mode
        const baseSem = getNormalSemester(progName, course);
        if (targetSemInt < baseSem) {
            setStatus(`במצב סימולציה ניתן לדחות קורס לסמסטר מאוחר יותר (סמסטר ${baseSem} ומעלה)`, true);
            return;
        }
        if (!simManualDelays[progName]) simManualDelays[progName] = {};
        if (targetSemInt === baseSem) {
            delete simManualDelays[progName][courseCode];
            setStatus(`בוטלה הדחייה הידנית של "${course.name_he}" (${courseCode})`);
        } else {
            const snapped = snapSemesterForSimulation(targetSemInt, baseSem, course, isFreeParityEnabled());
            simManualDelays[progName][courseCode] = snapped;
            setStatus(`סימולציה: "${course.name_he}" (${courseCode}) נדחה מסמסטר ${baseSem} לסמסטר ${snapped}`);
        }
        savePlacementsState();
    }

    renderAll();
    if (selectedCourseCode === courseCode) {
        showDetails(courseCode, false);
    }
}

/**
 * Render the Interactive SVG Graph View
 */
function renderGraph(programName, activeTracks, searchTerm = '') {
    const graphView = document.getElementById('graph-view');
    const contentArea = document.getElementById('content');
    if (!graphView || !contentArea) return;

    const program = getCurrentProgram();
    if (!program) {
        graphView.innerHTML = '<div style="padding:2rem;color:#64748b;">בחר תוכנית לימודים להצגת מפת הקורסים.</div>';
        return;
    }

    const activeCourses = getActiveProgramCourses(program, activeTracks);
    const schedule = computeEffectiveSchedule(program, activeCourses);
    updateSimulationBannerMetrics(activeCourses, schedule);

    const term = searchTerm.trim().toLowerCase();

    // Determine semester columns to display
    let maxCourseSem = 8;
    activeCourses.forEach(c => {
        const s = schedule[c.course_code]?.semester || c.default_semester;
        if (s > maxCourseSem) maxCourseSem = s;
        (c.allowed_semesters || []).forEach(as => {
            if (as > maxCourseSem) maxCourseSem = as;
        });
    });

    const totalSemesters = appMode === 'simulation'
        ? Math.max(maxCourseSem + 1, 8 + extraSimColumns)
        : Math.max(maxCourseSem, 8);

    const semesters = [];
    for (let s = 1; s <= totalSemesters; s++) {
        semesters.push(s);
    }

    // Group courses into columns by effective semester
    const coursesBySem = {};
    semesters.forEach(s => { coursesBySem[s] = []; });
    activeCourses.forEach(c => {
        const effSem = schedule[c.course_code]?.semester || c.default_semester;
        if (!coursesBySem[effSem]) coursesBySem[effSem] = [];
        coursesBySem[effSem].push(c);
    });

    // Sort courses inside each column: Core -> Infrastructure -> Track Mandatory -> Elective
    const catOrder = { 'חובה': 1, 'תשתית': 2, 'תשתית מומלץ': 3, 'חובה במסלול': 4, 'בחירה': 5, 'סדנה / שירות': 6 };
    Object.values(coursesBySem).forEach(list => {
        list.sort((a, b) => {
            const oa = catOrder[a.category] || 9;
            const ob = catOrder[b.category] || 9;
            if (oa !== ob) return oa - ob;
            return a.course_code.localeCompare(b.course_code);
        });
    });

    const PADDING_X = 20;
    const HEADER_TOP = 6;
    const HEADER_HEIGHT = 40;
    const NODES_START_Y = HEADER_TOP + HEADER_HEIGHT + 14;
    const ROW_HEIGHT = 62;

    const minColWidth = 150;
    const availableWidth = Math.max(contentArea.clientWidth - 16, semesters.length * minColWidth + PADDING_X * 2);
    const COLUMN_WIDTH = (availableWidth - PADDING_X * 2) / semesters.length;
    const NODE_WIDTH = Math.min(COLUMN_WIDTH * 0.78, 136);
    const NODE_HEIGHT = 46;

    let maxRows = 0;
    const nodes = {};

    semesters.forEach((sem, colIndex) => {
        const list = coursesBySem[sem] || [];
        if (list.length > maxRows) maxRows = list.length;
        const colX = PADDING_X + colIndex * COLUMN_WIDTH;
        const nodeX = colX + (COLUMN_WIDTH - NODE_WIDTH) / 2;

        list.forEach((c, rowIndex) => {
            const st = schedule[c.course_code];
            nodes[c.course_code] = {
                x: nodeX,
                y: NODES_START_Y + rowIndex * ROW_HEIGHT,
                rowIndex: rowIndex,
                colIndex: colIndex,
                code: c.course_code,
                name: c.name_he,
                credits: c.credits,
                sem: sem,
                course: c,
                state: st
            };
        });
    });

    const svgWidth = availableWidth;
    const svgHeight = Math.max(NODES_START_Y + maxRows * ROW_HEIGHT + 60, contentArea.clientHeight - 10, 520);

    let svg = `<svg id="courses-svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg">`;
    svg += `
        <defs>
            <marker id="arrow-prereq" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#ea580c" />
            </marker>
            <marker id="arrow-dep" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#16a34a" />
            </marker>
            <marker id="arrow-sim" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#e11d48" />
            </marker>
        </defs>
    `;

    // 1. Render Semester Columns (Dropzones + Headers)
    semesters.forEach((sem, colIndex) => {
        const colX = PADDING_X + colIndex * COLUMN_WIDTH;
        const headerX = colX + 5;
        const headerW = COLUMN_WIDTH - 10;
        const centerX = colX + COLUMN_WIDTH / 2;
        const list = coursesBySem[sem] || [];
        const semCredits = list.reduce((acc, c) => acc + (c.credits || 0), 0);
        const yearNum = Math.ceil(sem / 2);
        const yearNames = ['א\'', 'ב\'', 'ג\'', 'ד\'', 'ה\'', 'ו\'', 'ז\'', 'ח\''];
        const season = sem % 2 === 1 ? 'א\'' : 'ב\'';
        const isExtraYear = sem > 8;

        const colBg = isExtraYear
            ? (colIndex % 2 === 0 ? '#fff1f2' : '#ffe4e6')
            : (colIndex % 2 === 0 ? '#f8fafc' : '#ffffff');

        svg += `
            <g class="semester-column-group" data-semester="${sem}">
                <rect class="semester-dropzone" data-semester="${sem}"
                      x="${colX + 2}" y="${HEADER_TOP}" width="${COLUMN_WIDTH - 4}" height="${svgHeight - HEADER_TOP - 8}"
                      fill="${colBg}" stroke="${isExtraYear ? '#fda4af' : '#e2e8f0'}" stroke-width="1" rx="8" ry="8" />
                <rect x="${headerX}" y="${HEADER_TOP + 3}" width="${headerW}" height="${HEADER_HEIGHT - 5}"
                      fill="${isExtraYear ? '#ffe4e6' : '#0f2c59'}" rx="6" ry="6" />
                <text x="${centerX}" y="${HEADER_TOP + 17}" text-anchor="middle"
                      style="font-size: 10.5px; font-weight: 700; fill: ${isExtraYear ? '#9f1239' : '#ffffff'};">
                    סמסטר ${sem} (שנה ${yearNames[yearNum - 1] || yearNum} סמ' ${season})
                </text>
                <text x="${centerX}" y="${HEADER_TOP + 31}" text-anchor="middle"
                      style="font-size: 9.5px; font-weight: 600; fill: ${isExtraYear ? '#be123c' : '#bae6fd'};">
                    ${semCredits} נ"ז • ${list.length} קורסים
                </text>
            </g>
        `;
    });

    // 2. Render Course Nodes FIRST (so Edges can be rendered OVER the nodes!)
    const selectedInfo = selectedCourseCode ? appData.courses[selectedCourseCode] : null;
    const relatedCodes = new Set();
    if (selectedCourseCode) {
        relatedCodes.add(selectedCourseCode);
        (selectedInfo?.prerequisites || []).forEach(p => relatedCodes.add(p));
        (selectedInfo?.dependents || []).forEach(d => relatedCodes.add(d));
    }

    Object.values(nodes).forEach(n => {
        const c = n.course;
        const st = n.state;
        const isSelected = n.code === selectedCourseCode;
        const isCompleted = completedCourses.has(n.code);
        const isFlex = c.is_flexible_semester;
        const isDraggable = appMode === 'simulation' || isFlex;
        const isMatch = !term || n.code.toLowerCase().includes(term) || n.name.toLowerCase().includes(term);
        const isRelated = !selectedCourseCode || relatedCodes.has(n.code);

        // Determine colors
        const gradeEntry = studentGradesByCode[n.code];
        let fill = '#e0f2fe';
        let stroke = '#0284c7';
        let strokeWidth = '1.5';
        let dashArray = '';
        let badgeText = `${n.credits} נ"ז`;
        let badgeColor = '#0369a1';

        if (isFlex) {
            fill = '#f3e8ff';
            stroke = '#7e22ce';
            strokeWidth = '1.8';
            badgeText = `⇄ סמ' ${c.allowed_semesters.join(',')}`;
            badgeColor = '#6b21a8';
        }

        if (gradeEntry) {
            if (gradeEntry.is_pass) {
                badgeText = `✓ ציון: ${gradeEntry.final_grade}`;
                badgeColor = '#15803d';
            } else if (gradeEntry.status === 'fail') {
                fill = '#fef2f2';
                stroke = '#dc2626';
                strokeWidth = '2.2';
                badgeText = `⚠️ ציון: ${gradeEntry.final_grade}`;
                badgeColor = '#b91c1c';
            } else if (gradeEntry.status === 'pending') {
                badgeText = `⏳ ${gradeEntry.final_grade} (${n.credits} נ"ז)`;
                badgeColor = '#b45309';
            }
        }

        if (appMode === 'simulation' && st) {
            if (st.simStatus === 'manual') {
                fill = '#fef3c7';
                stroke = '#d97706';
                strokeWidth = '2.2';
                badgeText = `📌 סמ' ${st.baseSemester}←${st.semester}`;
                badgeColor = '#b45309';
            } else if (st.simStatus === 'auto') {
                fill = '#ffe4e6';
                stroke = '#e11d48';
                strokeWidth = '2';
                dashArray = '4,2';
                badgeText = `⛓️ סמ' ${st.baseSemester}←${st.semester}`;
                badgeColor = '#be123c';
            }
        }

        if (isCompleted) {
            fill = '#f1f5f9';
            stroke = '#94a3b8';
        }

        if (isSelected) {
            fill = '#dbeafe';
            stroke = '#1d4ed8';
            strokeWidth = '2.8';
            dashArray = '';
        } else if (selectedInfo && isMatch) {
            if (selectedInfo.prerequisites && selectedInfo.prerequisites.includes(n.code)) {
                fill = '#ffedd5';
                stroke = '#ea580c';
                strokeWidth = '2.4';
            } else if (selectedInfo.dependents && selectedInfo.dependents.includes(n.code)) {
                fill = '#dcfce7';
                stroke = '#16a34a';
                strokeWidth = '2.4';
            }
        }

        let opacity = 1;
        if (!isMatch) {
            opacity = 0.18;
        } else if (selectedCourseCode && !isRelated) {
            opacity = 0.45;
        } else if (isCompleted && !isSelected && !selectedCourseCode) {
            opacity = 0.68;
        }

        const shortName = n.name.length > 18 ? n.name.substring(0, 17) + '…' : n.name;
        const warnConflict = st && st.prereqConflict;

        const tooltipHtml = [
            `<strong>${n.name} (${n.code})</strong>`,
            `נקודות זכות: ${n.credits} נ"ז | קטגוריה: ${c.category}`,
            gradeEntry ? `🎓 <strong>גיליון ציונים (${gradeEntry.year}):</strong> ציון סופי <strong>${gradeEntry.final_grade || 'ללא ציון'}</strong> (${gradeEntry.credits} נ"ז מאוחד)` : '',
            gradeEntry && gradeEntry.attempts && gradeEntry.attempts.length > 1 ? `🔁 <strong>ניסיונות קודמים:</strong> ${gradeEntry.attempts.map(a => `${a.year}: ${a.grade_raw || 'ללא'}`).join(' ← ')}` : '',
            isFlex ? `🔄 <strong>קורס גמיש:</strong> ניתן ללימוד בסמסטרים ${c.allowed_semesters.join(', ')} (גרור עם העכבר!)` : `סמסטר מקורי: ${c.default_semester}`,
            st && st.simStatus === 'manual' ? `📌 <strong>נדחה ידנית בסימולציה:</strong> מסמסטר ${st.baseSemester} לסמסטר ${st.semester}` : '',
            st && st.simStatus === 'auto' ? `⛓️ <strong>נדחה אוטומטית:</strong> מסמסטר ${st.baseSemester} לסמסטר ${st.semester} עקב דחיית קדם ${st.causedBy}` : '',
            warnConflict ? `⚠️ <strong>שים לב:</strong> קדם (${warnConflict}) משובץ באותו סמסטר או אחריו!` : '',
            c.not_offered_this_year ? `⚠️ לא יינתן בתשפ"ז` : ''
        ].filter(Boolean).join('<br>');

        const escapedTooltip = tooltipHtml.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

        svg += `
            <g class="node-group ${isDraggable ? 'draggable-node' : ''}"
               data-code="${n.code}"
               data-semester="${n.sem}"
               style="opacity: ${opacity};"
               onmousedown="onNodeMouseDown(event, '${n.code}')"
               onmousemove="showTooltip('${escapedTooltip}', event.clientX, event.clientY)"
               onmouseleave="hideTooltip()">
                <rect x="${n.x}" y="${n.y}" width="${NODE_WIDTH}" height="${NODE_HEIGHT}"
                      fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"
                      ${dashArray ? `stroke-dasharray="${dashArray}"` : ''} rx="7" ry="7" />
                ${isFlex ? `<rect x="${n.x}" y="${n.y}" width="${NODE_WIDTH}" height="4" fill="#7e22ce" rx="3" />` : ''}
                <text x="${n.x + NODE_WIDTH - 8}" y="${n.y + 15}" text-anchor="end" direction="ltr"
                      style="font-size: 9px; font-weight: 700; fill: #334155;">${n.code}</text>
                <text x="${n.x + 8}" y="${n.y + 15}" text-anchor="start" direction="ltr"
                      style="font-size: 8.5px; font-weight: 700; fill: ${badgeColor};">${badgeText}</text>
                <text x="${n.x + NODE_WIDTH / 2}" y="${n.y + 31}" text-anchor="middle"
                      style="font-size: 10.5px; font-weight: 700; fill: ${isCompleted ? '#64748b' : '#0f172a'};">
                    ${shortName}
                </text>
                <text x="${n.x + NODE_WIDTH / 2}" y="${n.y + 44}" text-anchor="middle"
                      style="font-size: 8.5px; fill: ${appMode === 'simulation' && st?.simStatus === 'auto' ? '#be123c' : '#475569'};">
                    ${appMode === 'simulation' && st?.simStatus === 'auto' && st.causedBy ? `${c.category} • עקב ${st.causedBy}` : c.category}${c.not_offered_this_year ? ' ⚠️' : ''}${warnConflict ? ' ❗' : ''}
                </text>
                <g class="node-check-btn" style="cursor: pointer;"
                   onmousedown="event.stopPropagation();"
                   onclick="toggleCompletion('${n.code}', event)">
                    <title>${isCompleted ? 'הושלם (לחץ לביטול סימון)' : 'סמן קורס כהושלם (לחישוב נקודות זכות)'}</title>
                    <rect x="${n.x + 6}" y="${n.y + NODE_HEIGHT - 16}" width="12" height="12" rx="3" ry="3"
                          fill="${isCompleted ? '#16a34a' : '#ffffff'}"
                          stroke="${isCompleted ? '#15803d' : '#94a3b8'}" stroke-width="1.2" />
                    ${isCompleted ? `<text x="${n.x + 12}" y="${n.y + NODE_HEIGHT - 7}" text-anchor="middle" direction="ltr" style="font-size: 9px; font-weight: 900; fill: #ffffff; pointer-events: none;">✓</text>` : ''}
                </g>
            </g>
        `;
    });

    // 3. Render Edges OVER the Course Nodes (Top Layer with Rounded Orthogonal Channel Routing)
    svg += `<g class="edges-layer" style="pointer-events: none;">`;

    function buildRoundedPolyline(rawPoints, maxRadius = 7) {
        // Deduplicate very close consecutive points
        const pts = [];
        rawPoints.forEach(p => {
            if (!pts.length || Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 0.8) {
                pts.push({ x: p.x, y: p.y });
            }
        });
        if (pts.length < 2) return '';
        if (pts.length === 2) {
            return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
        }

        // Remove collinear intermediate vertices
        const clean = [pts[0]];
        for (let i = 1; i < pts.length - 1; i++) {
            const prev = clean[clean.length - 1];
            const curr = pts[i];
            const next = pts[i + 1];
            const sameX = Math.abs(prev.x - curr.x) < 0.8 && Math.abs(curr.x - next.x) < 0.8;
            const sameY = Math.abs(prev.y - curr.y) < 0.8 && Math.abs(curr.y - next.y) < 0.8;
            if (!sameX && !sameY) {
                clean.push(curr);
            }
        }
        clean.push(pts[pts.length - 1]);

        let d = `M ${clean[0].x.toFixed(1)} ${clean[0].y.toFixed(1)}`;
        for (let i = 1; i < clean.length - 1; i++) {
            const p0 = clean[i - 1];
            const p1 = clean[i];
            const p2 = clean[i + 1];

            const vx1 = p1.x - p0.x;
            const vy1 = p1.y - p0.y;
            const len1 = Math.hypot(vx1, vy1);

            const vx2 = p2.x - p1.x;
            const vy2 = p2.y - p1.y;
            const len2 = Math.hypot(vx2, vy2);

            const r = Math.min(maxRadius, len1 * 0.45, len2 * 0.45);
            if (r < 1.5) {
                d += ` L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
            } else {
                const startX = p1.x - (vx1 / len1) * r;
                const startY = p1.y - (vy1 / len1) * r;
                const endX = p1.x + (vx2 / len2) * r;
                const endY = p1.y + (vy2 / len2) * r;
                d += ` L ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
            }
        }
        const last = clean[clean.length - 1];
        d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
        return d;
    }

    function renderRoutedEdgeList(edgeList) {
        if (!edgeList.length) return;

        // 1. Group by source to stagger exit ports (y1) sorted by target position
        const bySrc = {};
        const byDst = {};
        edgeList.forEach(e => {
            if (!bySrc[e.src.code]) bySrc[e.src.code] = [];
            bySrc[e.src.code].push(e);
            if (!byDst[e.dst.code]) byDst[e.dst.code] = [];
            byDst[e.dst.code].push(e);
        });

        Object.values(bySrc).forEach(list => {
            list.sort((a, b) => (a.dst.y - b.dst.y) || (a.dst.sem - b.dst.sem));
            const n = list.length;
            const step = Math.min(8, 22 / Math.max(n, 1));
            list.forEach((e, idx) => {
                e.y1 = e.src.y + NODE_HEIGHT / 2 + (idx - (n - 1) / 2) * step;
            });
        });

        Object.values(byDst).forEach(list => {
            list.sort((a, b) => (a.src.y - b.src.y) || (a.src.sem - b.src.sem));
            const n = list.length;
            const step = Math.min(8, 22 / Math.max(n, 1));
            list.forEach((e, idx) => {
                e.y2 = e.dst.y + NODE_HEIGHT / 2 + (idx - (n - 1) / 2) * step;
            });
        });

        // 2. Pre-assign horizontal corridors for multi-column edges (spanCols > 1)
        const corridorGroups = {};
        edgeList.forEach(e => {
            const src = e.src;
            const dst = e.dst;
            if (Math.abs(dst.sem - src.sem) > 1) {
                const gapBelowSrc = src.y + NODE_HEIGHT + (ROW_HEIGHT - NODE_HEIGHT) / 2;
                const gapAboveSrc = src.y - (ROW_HEIGHT - NODE_HEIGHT) / 2;
                let baseCorridorY;
                if (dst.rowIndex < src.rowIndex) {
                    baseCorridorY = gapAboveSrc;
                } else if (dst.rowIndex > src.rowIndex) {
                    baseCorridorY = gapBelowSrc;
                } else {
                    baseCorridorY = gapAboveSrc;
                }
                e.baseCorridorY = baseCorridorY;
                const key = Math.round(baseCorridorY);
                if (!corridorGroups[key]) corridorGroups[key] = [];
                corridorGroups[key].push(e);
            }
        });

        Object.values(corridorGroups).forEach(group => {
            group.sort((a, b) => (a.y1 + a.y2) - (b.y1 + b.y2));
            const count = group.length;
            const step = Math.min(4.8, 12 / Math.max(count, 1));
            group.forEach((e, idx) => {
                e.corridorY = e.baseCorridorY + (idx - (count - 1) / 2) * step;
            });
        });

        // 3. Assign non-crossing vertical alley lanes per inter-column gap
        // Alley index c is the vertical channel to the right of column c (between colIndex c and c+1)
        const alleyEdges = {};
        edgeList.forEach(e => {
            const c1 = e.src.colIndex;
            const c2 = e.dst.colIndex;
            if (c1 < c2) {
                const vEnd1 = (c2 - c1 === 1) ? e.y2 : e.corridorY;
                if (!alleyEdges[c1]) alleyEdges[c1] = [];
                alleyEdges[c1].push({ edge: e, role: 'first', vStart: e.y1, vEnd: vEnd1 });
                if (c2 - c1 > 1) {
                    const lastAlley = c2 - 1;
                    if (!alleyEdges[lastAlley]) alleyEdges[lastAlley] = [];
                    alleyEdges[lastAlley].push({ edge: e, role: 'last', vStart: e.corridorY, vEnd: e.y2 });
                }
            }
        });

        Object.entries(alleyEdges).forEach(([colIdxStr, items]) => {
            const colIdx = parseInt(colIdxStr, 10);
            const colX = PADDING_X + colIdx * COLUMN_WIDTH;
            const rightNodeEdge = colX + (COLUMN_WIDTH - NODE_WIDTH) / 2 + NODE_WIDTH;
            const nextLeftNodeEdge = colX + COLUMN_WIDTH + (COLUMN_WIDTH - NODE_WIDTH) / 2;
            const alleyCenter = (rightNodeEdge + nextLeftNodeEdge) / 2;

            // Separate upward vs downward segments and order lanes to prevent elbow crossings
            items.sort((a, b) => {
                const dyA = a.vEnd - a.vStart;
                const dyB = b.vEnd - b.vStart;
                const dir = (dyA + dyB) >= 0 ? -1 : 1;
                return dir * ((a.vStart + a.vEnd) - (b.vStart + b.vEnd));
            });

            const count = items.length;
            const laneStep = Math.min(5.5, 16 / Math.max(count, 1));
            items.forEach((item, idx) => {
                const offset = (idx - (count - 1) / 2) * laneStep;
                const laneX = alleyCenter + offset;
                if (item.role === 'first') item.edge.laneX1 = laneX;
                if (item.role === 'last') item.edge.laneX2 = laneX;
            });
        });

        // 4. Build waypoints, trimmed halo, shaft, and explicit horizontal arrowhead
        const ARROW_LEN = 8.5;
        const ARROW_HALF_W = 4.3;
        const HALO_START_INSET = 2.5;

        edgeList.forEach(e => {
            const src = e.src;
            const dst = e.dst;
            const y1 = e.y1;
            const y2 = e.y2;
            let shaftPoints = [];
            let haloPoints = [];
            let arrowPoly = '';

            if (src.sem < dst.sem) {
                const x1 = src.x + NODE_WIDTH;
                const x2 = dst.x;
                const x2Shaft = x2 - ARROW_LEN + 1;
                const x2Halo = x2 - ARROW_LEN - 0.5;
                const spanCols = dst.sem - src.sem;
                const laneX1 = e.laneX1 ?? (x1 + (COLUMN_WIDTH - NODE_WIDTH) / 2);

                if (spanCols === 1) {
                    if (Math.abs(y2 - y1) < 2) {
                        shaftPoints = [{ x: x1, y: y1 }, { x: x2Shaft, y: y2 }];
                        haloPoints = [{ x: x1 + HALO_START_INSET, y: y1 }, { x: x2Halo, y: y2 }];
                    } else {
                        shaftPoints = [
                            { x: x1, y: y1 },
                            { x: laneX1, y: y1 },
                            { x: laneX1, y: y2 },
                            { x: x2Shaft, y: y2 }
                        ];
                        haloPoints = [
                            { x: x1 + HALO_START_INSET, y: y1 },
                            { x: laneX1, y: y1 },
                            { x: laneX1, y: y2 },
                            { x: x2Halo, y: y2 }
                        ];
                    }
                } else {
                    const laneX2 = e.laneX2 ?? (x2 - (COLUMN_WIDTH - NODE_WIDTH) / 2);
                    const corridorY = e.corridorY ?? (src.y - (ROW_HEIGHT - NODE_HEIGHT) / 2);

                    shaftPoints = [
                        { x: x1, y: y1 },
                        { x: laneX1, y: y1 },
                        { x: laneX1, y: corridorY },
                        { x: laneX2, y: corridorY },
                        { x: laneX2, y: y2 },
                        { x: x2Shaft, y: y2 }
                    ];
                    haloPoints = [
                        { x: x1 + HALO_START_INSET, y: y1 },
                        { x: laneX1, y: y1 },
                        { x: laneX1, y: corridorY },
                        { x: laneX2, y: corridorY },
                        { x: laneX2, y: y2 },
                        { x: x2Halo, y: y2 }
                    ];
                }

                arrowPoly = `${x2.toFixed(1)},${y2.toFixed(1)} ${(x2 - ARROW_LEN).toFixed(1)},${(y2 - ARROW_HALF_W).toFixed(1)} ${(x2 - ARROW_LEN).toFixed(1)},${(y2 + ARROW_HALF_W).toFixed(1)}`;
            } else if (src.sem === dst.sem) {
                const x1 = src.x + NODE_WIDTH;
                const x2 = dst.x + NODE_WIDTH;
                const laneX = x1 + 14;
                const x2Shaft = x2 + ARROW_LEN - 1;
                const x2Halo = x2 + ARROW_LEN + 0.5;
                shaftPoints = [
                    { x: x1, y: y1 },
                    { x: laneX, y: y1 },
                    { x: laneX, y: y2 },
                    { x: x2Shaft, y: y2 }
                ];
                haloPoints = [
                    { x: x1 + HALO_START_INSET, y: y1 },
                    { x: laneX, y: y1 },
                    { x: laneX, y: y2 },
                    { x: x2Halo, y: y2 }
                ];
                arrowPoly = `${x2.toFixed(1)},${y2.toFixed(1)} ${(x2 + ARROW_LEN).toFixed(1)},${(y2 - ARROW_HALF_W).toFixed(1)} ${(x2 + ARROW_LEN).toFixed(1)},${(y2 + ARROW_HALF_W).toFixed(1)}`;
            } else {
                const x1 = src.x;
                const x2 = dst.x + NODE_WIDTH;
                const laneX1 = x1 - (COLUMN_WIDTH - NODE_WIDTH) / 2;
                const laneX2 = x2 + (COLUMN_WIDTH - NODE_WIDTH) / 2;
                const corridorY = Math.min(src.y, dst.y) - (ROW_HEIGHT - NODE_HEIGHT) / 2;
                const x2Shaft = x2 + ARROW_LEN - 1;
                const x2Halo = x2 + ARROW_LEN + 0.5;
                shaftPoints = [
                    { x: x1, y: y1 },
                    { x: laneX1, y: y1 },
                    { x: laneX1, y: corridorY },
                    { x: laneX2, y: corridorY },
                    { x: laneX2, y: y2 },
                    { x: x2Shaft, y: y2 }
                ];
                haloPoints = [
                    { x: x1 - HALO_START_INSET, y: y1 },
                    { x: laneX1, y: y1 },
                    { x: laneX1, y: corridorY },
                    { x: laneX2, y: corridorY },
                    { x: laneX2, y: y2 },
                    { x: x2Halo, y: y2 }
                ];
                arrowPoly = `${x2.toFixed(1)},${y2.toFixed(1)} ${(x2 + ARROW_LEN).toFixed(1)},${(y2 - ARROW_HALF_W).toFixed(1)} ${(x2 + ARROW_LEN).toFixed(1)},${(y2 + ARROW_HALF_W).toFixed(1)}`;
            }

            const dShaft = buildRoundedPolyline(shaftPoints, 6.5);
            const dHalo = buildRoundedPolyline(haloPoints, 6.5);
            svg += `<path d="${dHalo}" class="edge-path" stroke="#ffffff" stroke-width="${e.haloWidth}" opacity="0.88" />`;
            svg += `<path d="${dShaft}" class="edge-path" stroke="${e.color}" stroke-width="${e.strokeWidth}"
                          ${e.dashArray ? `stroke-dasharray="${e.dashArray}"` : ''} opacity="${e.opacity || 1}" />`;
            svg += `<polygon points="${arrowPoly}" fill="${e.color}" stroke="#ffffff" stroke-width="0.8" stroke-linejoin="round" />`;
        });
    }

    // 3a. In Simulation Mode (when no single course is selected), draw causal cascade edges
    if (appMode === 'simulation' && !selectedCourseCode) {
        const simEdges = [];
        Object.values(nodes).forEach(n => {
            if (n.state && n.state.simStatus === 'auto' && n.state.causedBy && nodes[n.state.causedBy]) {
                simEdges.push({
                    src: nodes[n.state.causedBy],
                    dst: n,
                    color: '#e11d48',
                    strokeWidth: 2.1,
                    haloWidth: 4.2,
                    dashArray: '5,3',
                    opacity: 0.92
                });
            }
        });
        renderRoutedEdgeList(simEdges);
    }

    // 3b. Selected Course Prerequisite & Dependent Edges (drawn on very top!)
    if (selectedCourseCode && nodes[selectedCourseCode]) {
        const targetNode = nodes[selectedCourseCode];
        const courseInfo = appData.courses[selectedCourseCode];
        const selectedEdges = [];

        if (courseInfo && courseInfo.prerequisites) {
            courseInfo.prerequisites.forEach(prereqCode => {
                const sourceNode = nodes[prereqCode];
                if (sourceNode) {
                    selectedEdges.push({
                        src: sourceNode,
                        dst: targetNode,
                        color: '#ea580c',
                        strokeWidth: 2.5,
                        haloWidth: 4.6,
                        dashArray: '',
                        opacity: 1
                    });
                }
            });
        }

        if (courseInfo && courseInfo.dependents) {
            courseInfo.dependents.forEach(depCode => {
                const depNode = nodes[depCode];
                if (depNode) {
                    selectedEdges.push({
                        src: targetNode,
                        dst: depNode,
                        color: '#16a34a',
                        strokeWidth: 2.5,
                        haloWidth: 4.6,
                        dashArray: '',
                        opacity: 1
                    });
                }
            });
        }

        renderRoutedEdgeList(selectedEdges);
    }

    svg += `</g></svg>`;
    graphView.innerHTML = svg;
}

/**
 * Mouse Drag-and-Drop Handler for Course Nodes in SVG
 */
function onNodeMouseDown(event, courseCode) {
    if (event.button !== 0) return; // Only left mouse button
    event.stopPropagation();
    hideTooltip();

    const program = getCurrentProgram();
    if (!program) return;
    const activeCourses = getActiveProgramCourses(program, getSelectedTracks());
    const course = activeCourses.find(c => c.course_code === courseCode);
    if (!course) return;

    const schedule = computeEffectiveSchedule(program, activeCourses);
    const currentSem = schedule[courseCode]?.semester || course.default_semester;
    const baseSem = getNormalSemester(program.program_name, course);

    // Determine valid target semesters for dragging
    let validSemesters = [];
    if (appMode === 'normal') {
        if (course.is_flexible_semester) {
            validSemesters = [...course.allowed_semesters];
        }
    } else {
        // Simulation Mode: any semester >= baseSem (snapped if parity is enforced)
        const maxCols = Math.max(12, currentSem + 4);
        const freeParity = isFreeParityEnabled();
        for (let s = baseSem; s <= maxCols; s++) {
            if (freeParity || hasBothParities(course) || (s % 2 === baseSem % 2)) {
                validSemesters.push(s);
            }
        }
    }

    dragState = {
        courseCode,
        course,
        startX: event.clientX,
        startY: event.clientY,
        isDragging: false,
        currentSem,
        baseSem,
        validSemesters,
        hoveredSemester: null
    };
}

window.addEventListener('mousemove', event => {
    if (!dragState) return;

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (!dragState.isDragging && Math.hypot(dx, dy) >= 6) {
        dragState.isDragging = true;

        if (appMode === 'normal' && !dragState.course.is_flexible_semester) {
            setStatus(`קורס "${dragState.course.name_he}" קבוע בסמסטר ${dragState.course.default_semester}. להזזת כל קורס עבור ל"מצב סימולציה" 🧪`, true);
            dragState = null;
            return;
        }

        // Highlight valid dropzone columns
        document.querySelectorAll('.semester-dropzone').forEach(rect => {
            const sem = parseInt(rect.dataset.semester);
            if (dragState.validSemesters.includes(sem)) {
                rect.setAttribute('stroke', appMode === 'simulation' ? '#f59e0b' : '#7e22ce');
                rect.setAttribute('stroke-width', '2.5');
                rect.setAttribute('stroke-dasharray', '6,4');
            }
        });
    }

    if (!dragState || !dragState.isDragging) return;

    // Detect which semester column the cursor is over
    let foundSem = null;
    document.querySelectorAll('.semester-dropzone').forEach(rect => {
        const box = rect.getBoundingClientRect();
        if (event.clientX >= box.left && event.clientX <= box.right &&
            event.clientY >= box.top && event.clientY <= box.bottom) {
            foundSem = parseInt(rect.dataset.semester);
        }
    });

    dragState.hoveredSemester = foundSem;

    const ghost = document.getElementById('drag-ghost');
    if (ghost) {
        ghost.style.display = 'block';
        ghost.style.left = (event.clientX + 14) + 'px';
        ghost.style.top = (event.clientY + 14) + 'px';

        if (foundSem) {
            if (appMode === 'normal') {
                const ok = dragState.validSemesters.includes(foundSem);
                ghost.style.borderColor = ok ? '#a855f7' : '#ef4444';
                ghost.innerHTML = ok
                    ? `⇄ העבר את <strong>${dragState.course.name_he}</strong> לסמסטר <strong>${foundSem}</strong>`
                    : `⛔ סמסטר ${foundSem} אינו ברשימת הסמסטרים של הקורס (${dragState.validSemesters.join(', ')})`;
            } else {
                const snapped = snapSemesterForSimulation(foundSem, dragState.baseSem, dragState.course, isFreeParityEnabled());
                const ok = foundSem >= dragState.baseSem;
                ghost.style.borderColor = ok ? '#f59e0b' : '#ef4444';
                ghost.innerHTML = ok
                    ? `🧪 דחה את <strong>${dragState.course.name_he}</strong> לסמסטר <strong>${snapped}</strong>${snapped !== foundSem ? ` (מותאם לעונת סמסטר א'/ב')` : ''}`
                    : `⛔ לא ניתן להקדים לפני סמסטר המקור (${dragState.baseSem})`;
            }
        } else {
            ghost.innerHTML = `גרור לעמודת הסמסטר הרצויה...`;
        }
    }
});

window.addEventListener('mouseup', () => {
    if (!dragState) return;
    const state = dragState;
    dragState = null;

    const ghost = document.getElementById('drag-ghost');
    if (ghost) ghost.style.display = 'none';

    if (!state.isDragging) {
        // Treat as click -> toggle or show course details
        if (selectedCourseCode === state.courseCode && !isSidebarOpen) {
            clearSelectedCourse();
        } else {
            showDetails(state.courseCode);
        }
        return;
    }

    if (state.hoveredSemester !== null) {
        moveCourseToSemester(state.courseCode, state.hoveredSemester);
    } else {
        renderAll();
    }
});

/**
 * Render List View grouped by effective semester
 */
function renderProgramList(programName, activeTracks, searchTerm = '') {
    const listView = document.getElementById('list-view');
    if (!listView) return;

    const program = getCurrentProgram();
    if (!program) {
        listView.innerHTML = '<p>לא נמצאה תוכנית לימודים.</p>';
        return;
    }

    const activeCourses = getActiveProgramCourses(program, activeTracks);
    const schedule = computeEffectiveSchedule(program, activeCourses);
    const term = searchTerm.trim().toLowerCase();

    const filtered = activeCourses.filter(c => {
        if (!term) return true;
        return c.course_code.toLowerCase().includes(term) || c.name_he.toLowerCase().includes(term);
    });

    const bySem = {};
    filtered.forEach(c => {
        const sem = schedule[c.course_code]?.semester || c.default_semester;
        if (!bySem[sem]) bySem[sem] = [];
        bySem[sem].push(c);
    });

    let html = `<div class="semester-Grid">`;
    Object.keys(bySem).map(Number).sort((a, b) => a - b).forEach(sem => {
        const list = bySem[sem];
        const semCredits = list.reduce((s, c) => s + (c.credits || 0), 0);

        html += `
            <div class="semester-group">
                <div class="semester-group-header">
                    <h3>סמסטר ${sem}</h3>
                    <span class="badge badge-credits">${semCredits} נ"ז (${list.length} קורסים)</span>
                </div>
        `;

        list.forEach(c => {
            const isCompleted = completedCourses.has(c.course_code);
            const st = schedule[c.course_code];
            let extraClass = '';
            if (appMode === 'simulation' && st?.simStatus === 'manual') extraClass = 'sim-manual-course';
            else if (appMode === 'simulation' && st?.simStatus === 'auto') extraClass = 'sim-auto-course';
            else if (c.is_flexible_semester) extraClass = 'flex-course';

            html += `
                <div class="course-card ${extraClass} ${isCompleted ? 'completed' : ''}" onclick="showDetails('${c.course_code}')">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                        <div>
                            <div class="card-title"><strong>${c.course_code}</strong> — ${c.name_he} (${c.credits} נ"ז)</div>
                            <div style="font-size:0.76rem; color:#64748b; margin-top:2px;">
                                [${c.track} • ${c.category}] ${c.lecturer ? `• ${c.lecturer}` : ''}
                            </div>
                            <div style="display:flex; gap:0.3rem; flex-wrap:wrap; margin-top:4px;">
                                ${c.is_flexible_semester ? `<span class="badge badge-flex">⇄ גמיש: סמ' ${c.allowed_semesters.join(', ')}</span>` : ''}
                                ${appMode === 'simulation' && st?.simStatus === 'manual' ? `<span class="badge badge-sim-manual">📌 נדחה ידנית מסמ' ${st.baseSemester}</span>` : ''}
                                ${appMode === 'simulation' && st?.simStatus === 'auto' ? `<span class="badge badge-sim-auto">⛓️ נדחה מסמ' ${st.baseSemester} עקב ${st.causedBy}</span>` : ''}
                                ${c.not_offered_this_year ? `<span class="badge badge-warn">⚠️ לא יינתן בתשפ"ז</span>` : ''}
                            </div>
                        </div>
                        <input type="checkbox" ${isCompleted ? 'checked' : ''}
                               onclick="toggleCompletion('${c.course_code}', event)"
                               title="סמן כהושלם" style="cursor:pointer; width:1.15rem; height:1.15rem; margin-top:2px;">
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    });
    html += `</div>`;
    listView.innerHTML = html;
}

/**
 * Render Stats & Advisor Guidelines Tab
 */
function renderStats() {
    const statsView = document.getElementById('stats-view');
    const summaryEl = document.getElementById('stats-summary');
    if (!statsView || !summaryEl) return;

    const program = getCurrentProgram();
    if (!program) {
        statsView.innerHTML = '';
        summaryEl.innerHTML = '';
        return;
    }

    const activeTracks = getSelectedTracks();
    const activeCourses = getActiveProgramCourses(program, activeTracks);
    const schedule = computeEffectiveSchedule(program, activeCourses);

    // Separate mandatory/foundation credits vs elective credits
    const mandatoryCourses = activeCourses.filter(c => c.category !== 'בחירה');
    const mandatoryCredits = mandatoryCourses.reduce((s, c) => s + (c.credits || 0), 0);

    const completedList = activeCourses.filter(c => completedCourses.has(c.course_code));
    const completedCredits = completedList.reduce((s, c) => s + (c.credits || 0), 0);

    const targetDegreeCredits = program.min_required_credits > 0 ? program.min_required_credits : mandatoryCredits;
    const progressPercent = targetDegreeCredits > 0 ? Math.min(100, Math.round((completedCredits / targetDegreeCredits) * 100)) : 0;

    summaryEl.innerHTML = `
        <div style="width: 48px; height: 6px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
            <div style="width: ${progressPercent}%; height: 100%; background: #4ade80;"></div>
        </div>
        <strong>${progressPercent}%</strong>
        <span>(${completedCredits}/${targetDegreeCredits} נ"ז)</span>
    `;

    let html = `
        <h2 style="margin-top:0; color:var(--primary);">סיכום נקודות זכות והנחיות ייעוץ — ${program.program_name} (תשפ"ז)</h2>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div class="details-section">
                <h4>🎯 יעד נקודות זכות לתואר</h4>
                <div style="font-size:1.5rem; font-weight:700; color:var(--primary);">${targetDegreeCredits} נ"ז</div>
                <div style="font-size:0.8rem; color:#64748b;">על פי תקנון התוכנית לתשפ"ז</div>
            </div>
            <div class="details-section">
                <h4>✅ נקודות זכות שהושלמו</h4>
                <div style="font-size:1.5rem; font-weight:700; color:#16a34a;">${completedCredits} נ"ז (${progressPercent}%)</div>
                <div style="font-size:0.8rem; color:#64748b;">${completedList.length} קורסים סומנו כהושלמו</div>
            </div>
            <div class="details-section">
                <h4>📚 קורסי ליבה, תשתית וחובת מסלול בתצוגה</h4>
                <div style="font-size:1.5rem; font-weight:700; color:#0284c7;">${mandatoryCredits} נ"ז</div>
                <div style="font-size:0.8rem; color:#64748b;">${mandatoryCourses.length} קורסי חובה/תשתית פעילים</div>
            </div>
        </div>
    `;

    if (program.notes && program.notes.length > 0) {
        html += `
            <div class="details-section" style="border-right: 4px solid var(--accent); margin-bottom: 1.5rem;">
                <h4>📌 הנחיות ודרישות התוכנית (מתוך שנתון תשפ"ז):</h4>
                <ul style="margin:0; padding-right:1.2rem; font-size:0.88rem; line-height:1.6;">
                    ${program.notes.map(n => `<li>${n}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Per-semester credit breakdown
    const semTotals = {};
    const semDone = {};
    activeCourses.forEach(c => {
        const sem = schedule[c.course_code]?.semester || c.default_semester;
        semTotals[sem] = (semTotals[sem] || 0) + (c.credits || 0);
        if (completedCourses.has(c.course_code)) {
            semDone[sem] = (semDone[sem] || 0) + (c.credits || 0);
        }
    });

    html += `<h3>עומס נקודות זכות לפי סמסטר (${appMode === 'simulation' ? 'במצב סימולציה' : 'בתכנון הנוכחי'})</h3>`;
    html += `<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.85rem;">`;
    Object.keys(semTotals).map(Number).sort((a, b) => a - b).forEach(sem => {
        const tot = semTotals[sem];
        const done = semDone[sem] || 0;
        const pct = tot > 0 ? Math.round((done / tot) * 100) : 0;
        html += `
            <div class="details-section" style="margin-bottom:0;">
                <h4 style="margin-bottom:0.25rem;">סמסטר ${sem}</h4>
                <div style="font-size:0.85rem; margin-bottom:0.4rem;"><strong>${tot} נ"ז</strong> בתצוגה (${done} הושלמו)</div>
                <div style="width:100%; height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:#16a34a;"></div>
                </div>
            </div>
        `;
    });
    html += `</div>`;

    statsView.innerHTML = html;
}

/**
 * Show Course Details & Semester Mover Controls in Sidebar
 */
function showDetails(courseCode, rerenderGraph = true) {
    selectedCourseCode = courseCode;
    const clearBtn = document.getElementById('clear-selection-btn');
    if (clearBtn) clearBtn.style.display = 'inline-block';
    updateSidebarToggleButton();

    const program = getCurrentProgram();
    const activeTracks = getSelectedTracks();
    const searchTerm = document.getElementById('course-search')?.value || '';

    if (rerenderGraph && program) {
        renderGraph(program.program_name, activeTracks, searchTerm);
    }

    const detailsContent = document.getElementById('details-content');
    if (!detailsContent) return;

    const courseCatalogEntry = appData.courses[courseCode];
    const activeCourses = program ? getActiveProgramCourses(program, activeTracks) : [];
    const progCourse = activeCourses.find(c => c.course_code === courseCode)
        || (program ? program.courses.find(c => c.course_code === courseCode) : null);

    if (!courseCatalogEntry && !progCourse) {
        detailsContent.innerHTML = `<div class="details-section">קורס ${courseCode} לא נמצא במאגר.</div>`;
        return;
    }

    const schedule = program ? computeEffectiveSchedule(program, activeCourses) : {};
    const st = schedule[courseCode];
    const currentSem = st ? st.semester : (progCourse ? progCourse.default_semester : 1);
    const baseSem = st ? st.baseSemester : (progCourse ? progCourse.default_semester : 1);

    const nameHe = progCourse ? progCourse.name_he : courseCatalogEntry.name_he;
    const credits = progCourse ? progCourse.credits : courseCatalogEntry.credits;
    const isCompleted = completedCourses.has(courseCode);
    const isFlex = progCourse && progCourse.is_flexible_semester;

    let moverHtml = '';
    if (progCourse) {
        if (appMode === 'normal') {
            if (isFlex) {
                moverHtml = `
                    <div class="semester-mover-box flex-box">
                        <span class="semester-mover-title" style="color:#6b21a8;">
                            ⇄ קורס גמיש — ניתן לבחור סמסטר (או לגרור עם העכבר במפה):
                        </span>
                        <div class="sem-btn-group">
                            ${progCourse.allowed_semesters.map(s => `
                                <button class="btn-sem-choice ${currentSem === s ? 'active' : ''}"
                                        onclick="moveCourseToSemester('${courseCode}', ${s})">
                                    סמסטר ${s} ${s === progCourse.default_semester ? '(ברירת מחדל)' : ''}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else {
                moverHtml = `
                    <div class="semester-mover-box">
                        <span class="semester-mover-title" style="color:#475569;">
                            🔒 קורס בסמסטר קבוע (סמסטר ${currentSem})
                        </span>
                        <div style="font-size:0.78rem; color:#64748b; margin-bottom:0.4rem;">
                            רוצה לבדוק מה יקרה אם תדחה את הקורס לשנה הבאה?
                        </div>
                        <button class="btn-sem-choice" style="border-color:#d97706; color:#b45309; width:100%;"
                                onclick="setAppMode('simulation'); moveCourseToSemester('${courseCode}', ${currentSem + 2});">
                            🧪 דחה בשנה (+2 סמ') במצב סימולציה
                        </button>
                    </div>
                `;
            }
        } else {
            // Simulation Mode Mover Box
            const freeParity = isFreeParityEnabled();
            const simChoices = [];
            for (let s = baseSem; s <= Math.max(12, currentSem + 2); s++) {
                if (freeParity || hasBothParities(progCourse) || (s % 2 === baseSem % 2)) {
                    simChoices.push(s);
                }
            }
            moverHtml = `
                <div class="semester-mover-box sim-box">
                    <span class="semester-mover-title" style="color:#92400e;">
                        🧪 סימולציית דחיית קורס (סמסטר מקורי: ${baseSem} | נוכחי: ${currentSem}):
                    </span>
                    ${st?.simStatus === 'auto' ? `
                        <div style="font-size:0.78rem; color:#be123c; margin-bottom:0.45rem; font-weight:600;">
                            ⛓️ קורס זה נדחה אוטומטית לסמסטר ${currentSem} עקב דחיית קורס הקדם ${st.causedBy}.
                        </div>
                    ` : ''}
                    <div class="sem-btn-group" style="margin-bottom:0.45rem;">
                        ${simChoices.map(s => `
                            <button class="btn-sem-choice ${currentSem === s ? 'sim-active' : ''}"
                                    onclick="moveCourseToSemester('${courseCode}', ${s})">
                                סמ' ${s}${s === baseSem ? ' (מקורי)' : ''}
                            </button>
                        `).join('')}
                    </div>
                    <div style="display:flex; gap:0.35rem;">
                        <button class="btn-sem-choice" style="flex:1;" onclick="moveCourseToSemester('${courseCode}', ${currentSem + 2})">
                            ⏩ דחה בשנה (+2)
                        </button>
                        ${currentSem > baseSem ? `
                            <button class="btn-sem-choice" style="color:#dc2626; border-color:#fca5a5;" onclick="moveCourseToSemester('${courseCode}', ${baseSem})">
                                ↩ אפס למקורי (${baseSem})
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    }

    // Format prerequisites (with AND/OR groups)
    const prereqGroups = courseCatalogEntry?.prereq_groups || [];
    const flatPrereqs = courseCatalogEntry?.prerequisites || [];
    const exclusions = courseCatalogEntry?.exclusions || [];
    const dependents = courseCatalogEntry?.dependents || [];

    let prereqHtml = '';
    if (prereqGroups.length > 0) {
        prereqHtml = `<ul class="course-link-list">` + prereqGroups.map((grp, idx) => {
            const itemsStr = grp.map(pCode => {
                const pObj = appData.courses[pCode];
                const pName = pObj ? pObj.name_he : 'קורס חיצוני';
                const isDone = completedCourses.has(pCode);
                return `<span onclick="showDetails('${pCode}')" style="text-decoration:underline; cursor:pointer; font-weight:600; color:${isDone ? '#16a34a' : '#ea580c'};">${pCode} - ${pName}${isDone ? ' ✓' : ''}</span>`;
            }).join(' <strong style="color:#64748b;">או</strong> ');
            return `<li class="course-link-item" style="display:block;">${idx > 0 ? '<div style="font-size:0.72rem; color:#475569; font-weight:700;">וגם:</div>' : ''}${itemsStr}</li>`;
        }).join('') + `</ul>`;
    } else if (flatPrereqs.length > 0) {
        prereqHtml = `<ul class="course-link-list">` + flatPrereqs.map(pCode => {
            const pObj = appData.courses[pCode];
            return `<li class="course-link-item" onclick="showDetails('${pCode}')"><span><strong>${pCode}</strong> — ${pObj ? pObj.name_he : ''}</span><span>🔗</span></li>`;
        }).join('') + `</ul>`;
    } else {
        prereqHtml = `<div style="font-size:0.82rem; color:#64748b;">אין דרישות קדם בקובץ תשפ"ז.</div>`;
    }

    let exclusionsHtml = '';
    if (exclusions.length > 0) {
        exclusionsHtml = `
            <div class="details-section">
                <h4>🚫 קורסים חופפים (ללא זיכוי נוסף / בתנאי שלא ביצע):</h4>
                <ul class="course-link-list">
                    ${exclusions.map(eCode => {
                        const eObj = appData.courses[eCode];
                        return `<li class="course-link-item" onclick="showDetails('${eCode}')">
                            <span><strong>${eCode}</strong> — ${eObj ? eObj.name_he : ''}</span>
                        </li>`;
                    }).join('')}
                </ul>
            </div>
        `;
    }

    let dependentsHtml = '';
    if (dependents.length > 0) {
        dependentsHtml = `<ul class="course-link-list">` + dependents.map(dCode => {
            const dObj = appData.courses[dCode];
            const dSem = schedule[dCode]?.semester;
            return `<li class="course-link-item" onclick="showDetails('${dCode}')">
                <span><strong>${dCode}</strong> — ${dObj ? dObj.name_he : ''}</span>
                ${dSem ? `<span class="badge badge-cat">סמ' ${dSem}</span>` : ''}
            </li>`;
        }).join('') + `</ul>`;
    } else {
        dependentsHtml = `<div style="font-size:0.82rem; color:#64748b;">קורס זה אינו מהווה דרישת קדם לקורסים אחרים.</div>`;
    }

    detailsContent.innerHTML = `
        <div class="details-card-header">
            <h2 class="details-course-title">${nameHe}</h2>
            <div class="details-badges">
                <span class="badge badge-code">קוד: ${courseCode}</span>
                <span class="badge badge-credits">${credits} נ"ז</span>
                ${progCourse ? `<span class="badge badge-cat">${progCourse.category}</span>` : ''}
                ${progCourse ? `<span class="badge badge-cat">${progCourse.track}</span>` : ''}
                ${isFlex ? `<span class="badge badge-flex">⇄ סמסטרים: ${progCourse.allowed_semesters.join(', ')}</span>` : ''}
                ${progCourse?.not_offered_this_year ? `<span class="badge badge-warn">⚠️ לא יינתן בתשפ"ז</span>` : ''}
            </div>
            ${progCourse?.lecturer ? `<div style="font-size:0.82rem; color:#475569; margin-bottom:0.55rem;">👨‍🏫 מרצה: <strong>${progCourse.lecturer}</strong></div>` : ''}
            ${progCourse ? `
                <div style="font-size:0.78rem; color:#64748b; margin-bottom:0.65rem;">
                    שעות: הרצאה ${progCourse.hours_lecture} | תרגול ${progCourse.hours_recitation} | מעבדה ${progCourse.hours_lab} (סה"כ ${progCourse.semester_hours} ש"ס)
                </div>
            ` : ''}
            <button onclick="toggleCompletion('${courseCode}')" class="track-toggle ${isCompleted ? 'active' : ''}" style="width:100%; font-weight:700; padding:0.45rem;">
                ${isCompleted ? '✓ הושלם (לחץ לביטול)' : '☐ סמן קורס כהושלם'}
            </button>
            ${studentGradesByCode.has(courseCode) ? (() => {
                const gRec = studentGradesByCode.get(courseCode);
                const statusColor = gRec.status === 'pass' ? '#16a34a' : (gRec.status === 'fail' ? '#dc2626' : '#d97706');
                return `
                    <div style="margin-top:0.5rem; padding:0.45rem 0.6rem; border-radius:6px; background:#f8fafc; border:1px solid #cbd5e1; font-size:0.78rem;">
                        <div style="font-weight:700; color:${statusColor};">🎓 גיליון ציונים (${gRec.year}): ציון קובע ${gRec.final_grade || 'ללא'} (${gRec.credits} נ"ז)</div>
                        <div style="color:#64748b; font-size:0.72rem; margin-top:0.15rem;">קבוצות: ${gRec.groups.join(' + ')}</div>
                    </div>
                `;
            })() : ''}
        </div>

        ${moverHtml}

        <div class="details-section">
            <h4>🟧 דרישות קדם (חובה להשלים לפני הקורס):</h4>
            ${prereqHtml}
        </div>

        <div class="details-section">
            <h4>🟩 קורסי המשך (הנפתחים ע"י קורס זה):</h4>
            ${dependentsHtml}
        </div>

        ${exclusionsHtml}

        ${courseCatalogEntry?.prereq_text_raw ? `
            <div class="details-section" style="background:#f8fafc;">
                <h4>📄 נוסח מלא מתוך קובץ תנאי קדם תשפ"ז:</h4>
                <div style="font-size:0.78rem; color:#475569; line-height:1.5;">${courseCatalogEntry.prereq_text_raw}</div>
            </div>
        ` : ''}
    `;
}

function toggleCompletion(courseCode, event) {
    if (event) event.stopPropagation();
    if (completedCourses.has(courseCode)) {
        completedCourses.delete(courseCode);
    } else {
        completedCourses.add(courseCode);
    }
    localStorage.setItem('completedCourses', JSON.stringify([...completedCourses]));
    renderAll();
    if (selectedCourseCode === courseCode) {
        showDetails(courseCode, false);
    }
}

function showTooltip(html, x, y) {
    if (dragState && dragState.isDragging) return;
    const tt = document.getElementById('graph-tooltip');
    if (!tt) return;
    tt.innerHTML = html;
    tt.style.display = 'block';
    const maxX = window.innerWidth - 290;
    const maxY = window.innerHeight - 140;
    tt.style.left = Math.min(x + 14, maxX) + 'px';
    tt.style.top = Math.min(y + 14, maxY) + 'px';
}

function hideTooltip() {
    const tt = document.getElementById('graph-tooltip');
    if (tt) tt.style.display = 'none';
}

function updateTrackToggles(programName) {
    const container = document.getElementById('track-toggles');
    const actionsContainer = document.getElementById('track-quick-actions');
    const tracksRow = document.getElementById('tracks-row');
    if (!container || !actionsContainer || !tracksRow) return;

    container.innerHTML = '';
    actionsContainer.innerHTML = '';

    const program = appData.programs.find(p => p.program_name === programName);
    if (!program) return;

    const tracks = [...new Set(program.courses.map(c => c.track))].filter(t => t !== 'ליבה');
    if (tracks.length === 0) {
        tracksRow.style.display = 'none';
        return;
    }
    tracksRow.style.display = 'flex';

    let savedTracks = [];
    try {
        savedTracks = JSON.parse(localStorage.getItem(`biu_tracks_${program.program_id}`) || '[]');
    } catch (e) {
        savedTracks = [];
    }

    // By default, select the first track if none saved so the student immediately sees track courses too
    if (savedTracks.length === 0 && tracks.length > 0) {
        savedTracks = [tracks[0]];
    }

    tracks.forEach(track => {
        const btn = document.createElement('button');
        btn.className = 'track-toggle' + (savedTracks.includes(track) ? ' active' : '');
        const shortTrack = track
            .replace(/^מסלול\s+/, '')
            .replace('למידה סטטיסטית ובינה מלאכותית', 'למידה ו-AI')
            .replace('מעגלים ו-VLSI', 'ו-VLSI');
        btn.textContent = shortTrack;
        btn.title = track;
        btn.dataset.track = track;
        btn.onclick = () => {
            btn.classList.toggle('active');
            localStorage.setItem(`biu_tracks_${program.program_id}`, JSON.stringify(getSelectedTracks()));
            renderAll();
        };
        container.appendChild(btn);
    });

    const btnAll = document.createElement('button');
    btnAll.className = 'btn-track-helper';
    btnAll.textContent = 'בחר הכל';
    btnAll.onclick = () => {
        document.querySelectorAll('.track-toggle').forEach(b => b.classList.add('active'));
        localStorage.setItem(`biu_tracks_${program.program_id}`, JSON.stringify(getSelectedTracks()));
        renderAll();
    };

    const btnClear = document.createElement('button');
    btnClear.className = 'btn-track-helper';
    btnClear.textContent = 'ליבה בלבד';
    btnClear.onclick = () => {
        document.querySelectorAll('.track-toggle').forEach(b => b.classList.remove('active'));
        localStorage.setItem(`biu_tracks_${program.program_id}`, JSON.stringify([]));
        renderAll();
    };

    actionsContainer.appendChild(btnAll);
    actionsContainer.appendChild(btnClear);
}

function populateSelectors() {
    const programSelect = document.getElementById('program-select');
    if (!programSelect) return;
    programSelect.innerHTML = '';

    // Group programs by group
    const groupsMap = new Map();
    appData.programs.forEach(p => {
        const g = p.program_group || 'תוכניות לימודים';
        if (!groupsMap.has(g)) groupsMap.set(g, []);
        groupsMap.get(g).push(p);
    });

    groupsMap.forEach((progs, groupLabel) => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupLabel;
        progs.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.program_name;
            opt.textContent = `${p.program_name} (${p.courses.length} קורסים)`;
            optgroup.appendChild(opt);
        });
        programSelect.appendChild(optgroup);
    });

    const allNames = appData.programs.map(p => p.program_name);
    const savedProg = localStorage.getItem('selectedProgram');
    const initialProg = (savedProg && allNames.includes(savedProg)) ? savedProg : allNames[0];

    if (initialProg) {
        programSelect.value = initialProg;
        updateTrackToggles(initialProg);
    }

    const savedFreeParity = localStorage.getItem('biu_simFreeParity');
    const parityCheckbox = document.getElementById('sim-free-parity');
    if (parityCheckbox && savedFreeParity === '1') {
        parityCheckbox.checked = true;
    }

    setAppMode(appMode);
}

function renderAll() {
    const progName = getCurrentProgramName();
    if (!progName) return;
    const program = getCurrentProgram();
    const progLink = document.getElementById('header-program-link');
    if (progLink && program && program.url) {
        progLink.href = program.url;
        progLink.textContent = `🔗 דף התוכנית ↗`;
        progLink.title = `דף תוכנית "${program.program_name}" באתר הפקולטה`;
    }
    const activeTracks = getSelectedTracks();
    const searchTerm = document.getElementById('course-search')?.value || '';

    renderGraph(progName, activeTracks, searchTerm);
    renderProgramList(progName, activeTracks, searchTerm);
    renderStats();
    renderGradesView();
    updateSidebarToggleButton();
}

// --- Client-Side BIU Grade Sheet PDF Parser & Grades View ---

const PDF_GLYPH_MAP = {
    0x03: ' ',
    0x05: '"',
    0x06: '"',
    0x07: "'",
    0x0B: ')',
    0x0C: '(',
    0x0F: ',',
    0x10: '-',
    0x11: '.',
    0x12: '/',
    0x1D: ':'
};

function decodePdfToken(tok) {
    if (tok.startsWith('(') && tok.endsWith(')')) {
        return tok.slice(1, -1).trim();
    }
    if (tok.startsWith('<') && tok.endsWith('>')) {
        const hexStr = tok.slice(1, -1);
        const chars = [];
        for (let i = 0; i < hexStr.length; i += 4) {
            const code = parseInt(hexStr.slice(i, i + 4), 16);
            if (code >= 0x9A && code <= 0xB4) {
                chars.push(String.fromCharCode(0x05D0 + (code - 0x9A)));
            } else if (PDF_GLYPH_MAP[code] !== undefined) {
                chars.push(PDF_GLYPH_MAP[code]);
            } else if (code >= 0x20 && code <= 0x7E) {
                chars.push(String.fromCharCode(code));
            } else {
                chars.push(' ');
            }
        }
        return chars.reverse().join('').trim();
    }
    return tok.trim();
}

function classifyGradeRaw(gradeRaw) {
    const g = (gradeRaw || '').trim();
    if (!g) {
        return { status: 'none', numeric: null, is_pass: false, is_graded: false };
    }
    const mNum = g.match(/^(\d+(\.\d+)?)(?:\s*נ)?$/);
    if (mNum) {
        const val = parseFloat(mNum[1]);
        const isPass = val >= 60.0;
        return {
            status: isPass ? 'pass' : 'fail',
            numeric: Number.isInteger(val) ? Math.round(val) : val,
            is_pass: isPass,
            is_graded: true
        };
    }
    if (g.includes('עובר') || g.includes('פטור') || g.includes('זכאי')) {
        return { status: 'pass', numeric: null, is_pass: true, is_graded: true };
    }
    if (g === 'נ' || g.includes('נכשל') || g.includes('לא עבר')) {
        return { status: 'fail', numeric: null, is_pass: false, is_graded: true };
    }
    return { status: 'pending', numeric: null, is_pass: false, is_graded: true };
}

async function decompressPdfStream(uint8Slice) {
    for (const format of ['deflate', 'deflate-raw']) {
        try {
            const ds = new DecompressionStream(format);
            const writer = ds.writable.getWriter();
            writer.write(uint8Slice);
            writer.close();
            const outBuf = await new Response(ds.readable).arrayBuffer();
            const outBytes = new Uint8Array(outBuf);
            let str = '';
            for (let i = 0; i < outBytes.length; i++) {
                str += String.fromCharCode(outBytes[i]);
            }
            return str;
        } catch (_) {
            // Try next format
        }
    }
    return null;
}

async function parseGradeSheetPdfBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let rawLatin1 = '';
    for (let i = 0; i < bytes.length; i++) {
        rawLatin1 += String.fromCharCode(bytes[i]);
    }

    // Try resolving /Pages /Kids object hierarchy to combine multi-stream pages
    let pageTexts = [];
    try {
        const pagesMatch = rawLatin1.match(/\/Pages\s+(\d+)\s+0\s+R/);
        if (pagesMatch) {
            const pagesId = pagesMatch[1];
            const pagesObjMatch = rawLatin1.match(new RegExp(`\\b${pagesId}\\s+0\\s+obj([\\s\\S]*?)endobj`));
            if (pagesObjMatch) {
                const kidsMatch = pagesObjMatch[1].match(/\/Kids\s*\[([^\]]+)\]/);
                if (kidsMatch) {
                    const kidIds = [...kidsMatch[1].matchAll(/(\d+)\s+0\s+R/g)].map(m => m[1]);
                    for (const kidId of kidIds) {
                        const kidObjMatch = rawLatin1.match(new RegExp(`\\b${kidId}\\s+0\\s+obj([\\s\\S]*?)endobj`));
                        if (!kidObjMatch) continue;
                        const contMatch = kidObjMatch[1].match(/\/Contents\s*(\[[^\]]+\]|\d+\s+0\s+R)/);
                        if (!contMatch) continue;
                        const streamIds = [...contMatch[1].matchAll(/(\d+)\s+0\s+R/g)].map(m => m[1]);
                        const chunks = [];
                        for (const sid of streamIds) {
                            const sHeaderRegex = new RegExp(`\\b${sid}\\s+0\\s+obj[\\s\\S]*?stream\\r?\\n`);
                            const sMatch = sHeaderRegex.exec(rawLatin1);
                            if (!sMatch) continue;
                            const startOffset = sMatch.index + sMatch[0].length;
                            const endOffset = rawLatin1.indexOf('endstream', startOffset);
                            if (endOffset === -1) continue;
                            let actualEnd = endOffset;
                            while (actualEnd > startOffset && (bytes[actualEnd - 1] === 10 || bytes[actualEnd - 1] === 13)) {
                                actualEnd--;
                            }
                            const slice = bytes.subarray(startOffset, actualEnd);
                            const dec = await decompressPdfStream(slice);
                            if (dec) chunks.push(dec);
                        }
                        if (chunks.length) pageTexts.push(chunks.join('\n'));
                    }
                }
            }
        }
    } catch (_) {}

    // Fallback to raw stream regex if /Pages hierarchy could not be traversed
    if (pageTexts.length === 0) {
        const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
        let match;
        const streamSlices = [];
        while ((match = streamRegex.exec(rawLatin1)) !== null) {
            const startOffset = match.index + match[0].indexOf(match[1]);
            const endOffset = startOffset + match[1].length;
            streamSlices.push(bytes.subarray(startOffset, endOffset));
        }
        for (const slice of streamSlices) {
            const dec = await decompressPdfStream(slice);
            if (dec && dec.includes('Td')) pageTexts.push(dec);
        }
    }

    const pagesItems = [];
    const allTokens = [];
    const tdRegex = /([0-9.]+)\s+([0-9.]+)\s+Td\s+(<[^>]+>|\([^)]*\))\s+Tj/g;
    for (const pText of pageTexts) {
        const items = [];
        let m;
        while ((m = tdRegex.exec(pText)) !== null) {
            const x = parseFloat(m[1]);
            const y = parseFloat(m[2]);
            const text = decodePdfToken(m[3]);
            if (text) {
                items.push({ x, y, text });
                allTokens.push(text);
            }
        }
        pagesItems.push(items);
    }

    const isFormatB = allTokens.some(t =>
        t.includes('גיליון ציונים') || t.includes('מפגש') || t.includes('שנה"ל') || t.includes('מס  זיהוי') || t.includes('מס זיהוי')
    );

    let studentName = '';
    let studentId = '';
    let reportDate = '';
    const rawRows = [];
    let currentYear = '';
    let yearOrder = 0;
    const seenYears = {};

    let pageNum = 0;
    for (const items of pagesItems) {
        pageNum += 1;
        const rowsMap = new Map();
        for (const item of items) {
            let matchedY = null;
            for (const ky of rowsMap.keys()) {
                if (Math.abs(ky - item.y) <= 2.2) {
                    matchedY = ky;
                    break;
                }
            }
            if (matchedY === null) {
                matchedY = Math.round(item.y * 10) / 10;
                rowsMap.set(matchedY, []);
            }
            rowsMap.get(matchedY).push(item);
        }

        const sortedYs = [...rowsMap.keys()].sort((a, b) => b - a);
        for (const yk of sortedYs) {
            const rowItems = rowsMap.get(yk).sort((a, b) => b.x - a.x);
            const fullLine = rowItems.map(t => t.text).filter(Boolean).join(' ').trim();

            if (!reportDate) {
                const mDate = fullLine.match(/\b\d{2}\/\d{2}\/\d{4}\b/);
                if (mDate) reportDate = mDate[0];
            }

            if (isFormatB) {
                // Format B: Official BIU Transcript
                if (fullLine.includes('מס  זיהוי:') || fullLine.includes('מס זיהוי:')) {
                    for (const it of rowItems) {
                        if (/^\d{8,9}$/.test(it.text)) studentId = it.text;
                    }
                    const mName = fullLine.match(/שם:\s*([^\d:]+?)(?:\s+מס\s+זיהוי:|$)/);
                    if (mName && !studentName) studentName = mName[1].trim();
                    continue;
                }

                let cCode = null;
                for (const it of rowItems) {
                    if (it.x >= 460 && it.x <= 505 && /^\d{5}$/.test(it.text)) {
                        cCode = it.text;
                        break;
                    }
                }
                if (!cCode) continue;

                const yearParts = rowItems.filter(it => it.x > 510 && it.text).map(it => it.text);
                const mtypeParts = rowItems.filter(it => it.x >= 395 && it.x <= 455 && it.text).map(it => it.text);
                const nameParts = rowItems.filter(it => it.x >= 170 && it.x < 395 && it.text).map(it => it.text);
                const credParts = rowItems.filter(it => it.x >= 70 && it.x <= 95 && /^\d+(\.\d+)?$/.test(it.text)).map(it => it.text);
                const gradeParts = rowItems.filter(it => it.x < 70 && it.text).map(it => it.text);

                const rowYear = yearParts.length ? yearParts[0] : currentYear;
                if (rowYear && !seenYears[rowYear]) {
                    yearOrder += 1;
                    seenYears[rowYear] = yearOrder;
                }

                const mtype = mtypeParts.length ? mtypeParts[0] : '';
                const gradeRaw = gradeParts.join(' ').trim();
                const gInfo = classifyGradeRaw(gradeRaw);
                const creds = credParts.length ? parseFloat(credParts[0]) || 0 : 0;
                const codeSuffix = mtype || '01';
                const gnum = mtype.includes('הרצאה') ? 1 : (mtype.includes('תרגיל') ? 2 : 3);

                rawRows.push({
                    row_index: rawRows.length + 1,
                    page: pageNum,
                    year: rowYear,
                    year_idx: seenYears[rowYear] || 0,
                    full_code: `${cCode}-${codeSuffix}`,
                    course_code: cCode,
                    group_code: codeSuffix,
                    group_num: gnum,
                    name_he: nameParts.join(' '),
                    hours: creds,
                    credits: creds,
                    grade_raw: gradeRaw,
                    status: gInfo.status,
                    numeric_grade: gInfo.numeric,
                    is_pass: gInfo.is_pass,
                    has_grade: gInfo.is_graded
                });

            } else {
                // Format A: Inbar Course-Group Grade List
                if (fullLine.includes('שם הסטודנט') || fullLine.includes('תעודת זהות')) {
                    for (const it of rowItems) {
                        if (/^\d{8,9}$/.test(it.text)) {
                            studentId = it.text;
                        } else if (it.text.includes('שם הסטודנט')) {
                            const parts = it.text.split(':');
                            studentName = parts[parts.length - 1].trim();
                        }
                    }
                    continue;
                }

                if (fullLine.startsWith('שנה ')) {
                    currentYear = fullLine.replace('שנה ', '').trim();
                    if (!seenYears[currentYear]) {
                        yearOrder += 1;
                        seenYears[currentYear] = yearOrder;
                    }
                    continue;
                }

                let codeItem = null;
                for (const it of rowItems) {
                    if (it.x >= 220 && it.x <= 300 && /^\d{5}-\d{2}$/.test(it.text)) {
                        codeItem = it.text;
                        break;
                    }
                }
                if (!codeItem) continue;

                const [cCode, gCode] = codeItem.split('-');
                const nameParts = rowItems.filter(it => it.x > 300 && it.text).map(it => it.text);
                const hoursParts = rowItems.filter(it => it.x >= 165 && it.x < 220 && it.text).map(it => it.text);
                const credParts = rowItems.filter(it => it.x >= 112 && it.x < 165 && it.text).map(it => it.text);
                const gradeParts = rowItems.filter(it => it.x < 112 && it.text).map(it => it.text);

                const gradeRaw = gradeParts.join(' ').trim();
                const gInfo = classifyGradeRaw(gradeRaw);

                rawRows.push({
                    row_index: rawRows.length + 1,
                    page: pageNum,
                    year: currentYear,
                    year_idx: seenYears[currentYear] || 0,
                    full_code: codeItem,
                    course_code: cCode,
                    group_code: gCode,
                    group_num: parseInt(gCode, 10),
                    name_he: nameParts.join(' '),
                    hours: hoursParts.length ? parseFloat(hoursParts[0]) || 0 : 0,
                    credits: credParts.length ? parseFloat(credParts[0]) || 0 : 0,
                    grade_raw: gradeRaw,
                    status: gInfo.status,
                    numeric_grade: gInfo.numeric,
                    is_pass: gInfo.is_pass,
                    has_grade: gInfo.is_graded
                });
            }
        }
    }

    const byCourse = {};
    for (const r of rawRows) {
        if (!byCourse[r.course_code]) byCourse[r.course_code] = [];
        byCourse[r.course_code].push(r);
    }

    const courses = [];
    for (const cCode of Object.keys(byCourse).sort()) {
        const rlist = byCourse[cCode];
        const byYearMap = new Map();
        for (const r of rlist) {
            const key = `${r.year_idx}::${r.year}`;
            if (!byYearMap.has(key)) byYearMap.set(key, []);
            byYearMap.get(key).push(r);
        }

        const attempts = [];
        const sortedYearKeys = [...byYearMap.keys()].sort((a, b) => {
            return parseInt(a.split('::')[0], 10) - parseInt(b.split('::')[0], 10);
        });

        for (const yKey of sortedYearKeys) {
            const [yIdxStr, yName] = yKey.split('::');
            const yIdx = parseInt(yIdxStr, 10);
            const yRowsSorted = [...byYearMap.get(yKey)].sort((a, b) => a.group_num - b.group_num);
            const gradedRows = yRowsSorted.filter(r => r.grade_raw !== '');

            if (gradedRows.length <= 1) {
                const totCred = yRowsSorted.reduce((s, r) => s + r.credits, 0);
                const totHrs = yRowsSorted.reduce((s, r) => s + r.hours, 0);
                const gRaw = gradedRows.length ? gradedRows[0].grade_raw : '';
                const gGroup = gradedRows.length ? gradedRows[0].group_num : yRowsSorted[0].group_num;
                attempts.push({
                    year: yName,
                    year_idx: yIdx,
                    group_num: gGroup,
                    credits: totCred,
                    hours: totHrs,
                    grade_raw: gRaw,
                    groups: yRowsSorted.map(r => r.full_code)
                });
            } else {
                const clusters = new Map();
                for (const gr of gradedRows) {
                    clusters.set(gr.group_num, [gr]);
                }
                for (const r of yRowsSorted) {
                    if (r.grade_raw === '') {
                        const candidates = [...clusters.keys()].filter(gn => gn <= r.group_num);
                        const targetG = candidates.length ? Math.max(...candidates) : Math.min(...clusters.keys());
                        clusters.get(targetG).push(r);
                    }
                }
                for (const gnum of [...clusters.keys()].sort((a, b) => a - b)) {
                    const cRows = clusters.get(gnum);
                    attempts.push({
                        year: yName,
                        year_idx: yIdx,
                        group_num: gnum,
                        credits: cRows.reduce((s, x) => s + x.credits, 0),
                        hours: cRows.reduce((s, x) => s + x.hours, 0),
                        grade_raw: cRows[0].grade_raw,
                        groups: cRows.map(x => x.full_code)
                    });
                }
            }
        }

        const totalCredits = attempts.reduce((m, a) => Math.max(m, a.credits), 0);
        const totalHours = attempts.reduce((m, a) => Math.max(m, a.hours), 0);

        const gradedAttempts = attempts.filter(a => a.grade_raw !== '');
        const realGraded = gradedAttempts.filter(a => {
            const st = classifyGradeRaw(a.grade_raw).status;
            return st === 'pass' || st === 'fail';
        });
        const chosen = realGraded.length
            ? realGraded[realGraded.length - 1]
            : (gradedAttempts.length ? gradedAttempts[gradedAttempts.length - 1] : attempts[attempts.length - 1]);
        const cInfo = classifyGradeRaw(chosen.grade_raw);

        const namedRow = rlist.find(r => r.name_he);
        courses.push({
            course_code: cCode,
            name_he: namedRow ? namedRow.name_he : cCode,
            year: chosen.year,
            credits: totalCredits,
            hours: totalHours,
            final_grade: chosen.grade_raw,
            numeric_grade: cInfo.numeric,
            status: cInfo.status,
            is_pass: cInfo.is_pass,
            has_grade: cInfo.is_graded,
            is_engineering: cCode.startsWith('83'),
            groups: rlist.map(r => r.full_code),
            attempts
        });
    }

    const passedCourses = courses.filter(c => c.is_pass);
    const failedCourses = courses.filter(c => c.status === 'fail');
    const pendingCourses = courses.filter(c => c.status === 'pending' || c.status === 'none');

    const numericCourses = courses.filter(c => c.numeric_grade !== null && c.credits > 0);
    const weightedSum = numericCourses.reduce((s, c) => s + c.numeric_grade * c.credits, 0);
    const weightTotal = numericCourses.reduce((s, c) => s + c.credits, 0);
    const gpaOverall = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) / 100 : 0;

    const engNumeric = numericCourses.filter(c => c.is_engineering);
    const engWSum = engNumeric.reduce((s, c) => s + c.numeric_grade * c.credits, 0);
    const engWTot = engNumeric.reduce((s, c) => s + c.credits, 0);
    const gpaEngineering = engWTot > 0 ? Math.round((engWSum / engWTot) * 100) / 100 : 0;

    return {
        student_name: studentName,
        student_id: studentId,
        report_date: reportDate,
        raw_rows: rawRows,
        courses,
        summary: {
            total_raw_rows: rawRows.length,
            total_unique_courses: courses.length,
            passed_courses_count: passedCourses.length,
            passed_credits_total: passedCourses.reduce((s, c) => s + c.credits, 0),
            passed_credits_engineering: passedCourses.filter(c => c.is_engineering).reduce((s, c) => s + c.credits, 0),
            passed_credits_general: passedCourses.filter(c => !c.is_engineering).reduce((s, c) => s + c.credits, 0),
            failed_courses_count: failedCourses.length,
            failed_credits: failedCourses.reduce((s, c) => s + c.credits, 0),
            pending_courses_count: pendingCourses.length,
            gpa_overall: gpaOverall,
            gpa_engineering: gpaEngineering
        }
    };
}

function triggerGradesUpload() {
    document.getElementById('grades-pdf-input')?.click();
}

async function handleGradesPdfUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
        setStatus(`מפענח גיליון ציונים (${file.name})...`);
        const buf = await file.arrayBuffer();
        const parsed = await parseGradeSheetPdfBuffer(buf);
        if (!parsed.courses || parsed.courses.length === 0) {
            alert('לא נמצאו נתוני קורסים בקובץ ה-PDF. ודא שזהו גיליון ציונים מקורי ממערכת אינבר.');
            setStatus('שגיאה בפענוח גיליון הציונים', true);
            return;
        }
        applyGradeSheetToDashboard(parsed);
    } catch (err) {
        console.error('Failed parsing grade sheet PDF:', err);
        alert(`שגיאה בטעינת גיליון הציונים: ${err.message}`);
    } finally {
        event.target.value = '';
    }
}

function applyGradeSheetToDashboard(parsed) {
    studentGradesData = parsed;
    studentGradesByCode = new Map(parsed.courses.map(c => [c.course_code, c]));
    localStorage.setItem('biu_studentGradesData', JSON.stringify(parsed));

    // Sync completedCourses with passed courses from grade sheet
    completedCourses.clear();
    for (const c of parsed.courses) {
        if (c.is_pass) {
            completedCourses.add(c.course_code);
        }
    }
    localStorage.setItem('completedCourses', JSON.stringify([...completedCourses]));

    setStatus(
        `נטען גיליון ציונים: ${parsed.student_name || 'סטודנט'} | ${parsed.summary.passed_courses_count} קורסים עברו (${parsed.summary.passed_credits_total} נ"ז) | ממוצע: ${parsed.summary.gpa_overall}`
    );
    renderAll();
}

function toggleGradesOnlyGraded(checked) {
    gradesShowOnlyGraded = checked;
    renderGradesView();
}

function clearGradesSheet() {
    studentGradesData = null;
    studentGradesByCode = new Map();
    localStorage.removeItem('biu_studentGradesData');
    renderAll();
}

function selectCourseFromGrades(courseCode) {
    document.querySelectorAll('.tab').forEach(t => {
        if (t.dataset.tab === 'graph') {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    ['graph', 'list', 'stats', 'grades'].forEach(v => {
        const el = document.getElementById(`${v}-view`);
        if (el) el.style.display = v === 'graph' ? 'block' : 'none';
    });
    toggleDetailsSidebar(true);
    showDetails(courseCode, true);
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderGradesView() {
    const container = document.getElementById('grades-view');
    if (!container) return;

    if (!studentGradesData || !studentGradesData.courses || studentGradesData.courses.length === 0) {
        container.innerHTML = `
            <div class="grades-empty-state">
                <div class="grades-empty-icon">🎓</div>
                <h2>טעינת גיליון ציונים מאינבר (PDF)</h2>
                <p>העלה קובץ PDF של <strong>"רשימת ציוני קבוצות קורס לסטודנט"</strong> ממערכת אינבר כדי לסמן אוטומטית קורסים שעברת על הגרף, לחשב נקודות זכות (הרצאה + תרגול/מעבדה), ולצפות בסטטיסטיקות הממוצעים וכל השורות שחולצו.</p>
                <p class="grades-privacy-note">🔒 <strong>פרטיות מלאה:</strong> הקובץ מפוענח כולו בדפדפן שלך בלבד ואינו נשלח לשום שרת.</p>
                <button class="btn-primary-upload" onclick="triggerGradesUpload()">📄 בחר קובץ PDF של גיליון ציונים</button>
            </div>
        `;
        return;
    }

    const { student_name, student_id, report_date, summary, courses, raw_rows } = studentGradesData;
    const filteredCourses = gradesShowOnlyGraded ? courses.filter(c => c.has_grade) : courses;
    const filteredRawRows = gradesShowOnlyGraded ? raw_rows.filter(r => r.has_grade) : raw_rows;

    const statusBadgeHtml = (status, gradeRaw) => {
        if (status === 'pass') {
            return `<span class="grade-pill pass">✓ ${escapeHtml(gradeRaw || 'עבר')}</span>`;
        }
        if (status === 'fail') {
            return `<span class="grade-pill fail">✗ ${escapeHtml(gradeRaw || 'נכשל')}</span>`;
        }
        if (status === 'pending') {
            return `<span class="grade-pill pending">⏳ ${escapeHtml(gradeRaw)}</span>`;
        }
        return `<span class="grade-pill none">ללא ציון</span>`;
    };

    const coursesRowsHtml = filteredCourses.map((c, idx) => {
        const inCatalog = Boolean(appData?.courses?.[c.course_code]);
        const attemptsHistory = c.attempts.length > 1
            ? `<div class="grade-attempts-sub">היסטוריית ניסיונות: ${c.attempts.map(a => `${a.year} (${a.groups.join('+')}: <strong>${escapeHtml(a.grade_raw || 'ללא')}</strong>)`).join(' ← ')}</div>`
            : '';
        return `
            <tr class="grade-row-${c.status}" onclick="${inCatalog ? `selectCourseFromGrades('${c.course_code}')` : ''}" style="${inCatalog ? 'cursor:pointer;' : ''}">
                <td>${idx + 1}</td>
                <td><span class="code-badge">${escapeHtml(c.course_code)}</span></td>
                <td>
                    <div class="grade-course-title">${escapeHtml(c.name_he)}</div>
                    ${attemptsHistory}
                </td>
                <td>${escapeHtml(c.year)}</td>
                <td><span class="groups-list-chip">${c.groups.map(g => escapeHtml(g.split('-')[1])).join(' + ')}</span></td>
                <td>${c.hours}</td>
                <td><strong>${c.credits}</strong></td>
                <td>${statusBadgeHtml(c.status, c.final_grade)}</td>
                <td>${c.is_engineering ? '<span class="cat-tag eng">הנדסה (83)</span>' : '<span class="cat-tag gen">כללי / יהדות</span>'}</td>
            </tr>
        `;
    }).join('');

    const rawRowsHtml = filteredRawRows.map(r => {
        const typeLabel = r.group_num === 1 ? 'הרצאה / ראשי' : 'תרגול / מעבדה / קבוצה';
        return `
            <tr class="grade-row-${r.status}">
                <td>${r.row_index}</td>
                <td><span class="code-badge">${escapeHtml(r.full_code)}</span></td>
                <td>${escapeHtml(r.name_he)}</td>
                <td>${escapeHtml(r.year)}</td>
                <td>קבוצה ${escapeHtml(r.group_code)} (${typeLabel})</td>
                <td>${r.hours}</td>
                <td>${r.credits}</td>
                <td>${statusBadgeHtml(r.status, r.grade_raw)}</td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="grades-dashboard">
            <div class="grades-top-bar">
                <div class="grades-student-meta">
                    <span class="grades-student-title">🎓 גיליון ציונים: <strong>${escapeHtml(student_name || 'סטודנט')}</strong></span>
                    ${student_id ? `<span class="meta-chip">ת"ז: ${escapeHtml(student_id)}</span>` : ''}
                    ${report_date ? `<span class="meta-chip">תאריך הפקה: ${escapeHtml(report_date)}</span>` : ''}
                </div>
                <div class="grades-controls">
                    <label class="grades-filter-checkbox" title="הצג רק קורסים ושורות שבהם קיים ציון">
                        <input type="checkbox" id="grades-only-graded-cb" ${gradesShowOnlyGraded ? 'checked' : ''} onchange="toggleGradesOnlyGraded(this.checked)">
                        <span>✓ הצג רק עם ציון (${courses.filter(c => c.has_grade).length}/${courses.length} קורסים, ${raw_rows.filter(r => r.has_grade).length}/${raw_rows.length} שורות)</span>
                    </label>
                    <button class="btn-header-action btn-header-grades" onclick="triggerGradesUpload()">📄 החלף PDF</button>
                    <button class="btn-header-action btn-header-clear" onclick="clearGradesSheet()">🗑️ הסר גיליון</button>
                </div>
            </div>

            <div class="grades-kpi-grid">
                <div class="grades-kpi-card kpi-gpa">
                    <div class="kpi-value">${summary.gpa_overall.toFixed(2)}</div>
                    <div class="kpi-label">ממוצע משוקלל כללי</div>
                    <div class="kpi-sub">לפי נקודות זכות וקורסים עם ציון מספרי</div>
                </div>
                <div class="grades-kpi-card kpi-eng-gpa">
                    <div class="kpi-value">${summary.gpa_engineering.toFixed(2)}</div>
                    <div class="kpi-label">ממוצע קורסי הנדסה (83xxx)</div>
                    <div class="kpi-sub">${summary.passed_credits_engineering} נ"ז הנדסה שעברו</div>
                </div>
                <div class="grades-kpi-card kpi-credits">
                    <div class="kpi-value">${summary.passed_credits_total} <small>נ"ז</small></div>
                    <div class="kpi-label">סה"כ נ"ז שעברו בהצלחה</div>
                    <div class="kpi-sub">${summary.passed_credits_engineering} נ"ז הנדסה + ${summary.passed_credits_general} נ"ז יהדות/כללי</div>
                </div>
                <div class="grades-kpi-card kpi-counts">
                    <div class="kpi-value">${summary.passed_courses_count} <small>/ ${summary.total_unique_courses}</small></div>
                    <div class="kpi-label">קורסים שעברו בהצלחה</div>
                    <div class="kpi-sub">
                        <span class="sub-fail">✗ ${summary.failed_courses_count} נכשלו (${summary.failed_credits} נ"ז)</span> ·
                        <span class="sub-pend">⏳ ${summary.pending_courses_count} טרם נקבעו/ללא ציון</span>
                    </div>
                </div>
            </div>

            <div class="grades-section-card">
                <div class="grades-section-header">
                    <h3>📊 סיכום קורסים מאוחד (הרצאה + תרגול/מעבדה, ציון אחרון קובע) — ${filteredCourses.length} קורסים</h3>
                    <span class="grades-section-hint">לחץ על שורת קורס כדי להדגיש אותו בגרף ובסרגל הצד</span>
                </div>
                <div class="grades-table-wrap">
                    <table class="grades-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>קוד קורס</th>
                                <th>שם הקורס (והיסטוריית ניסיונות)</th>
                                <th>שנה אחרונה</th>
                                <th>קבוצות (הרצאה+תרגול)</th>
                                <th>ש"ש סה"כ</th>
                                <th>נ"ז סה"כ</th>
                                <th>ציון קובע</th>
                                <th>קטגוריה</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${coursesRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="grades-section-card">
                <div class="grades-section-header">
                    <h3>📋 כל השורות שחולצו מה-PDF (כולל קבוצות תרגול ומעבדה) — ${filteredRawRows.length} מתוך ${raw_rows.length} שורות</h3>
                    <span class="grades-section-hint">הסר את הסימון מ-"הצג רק עם ציון" למעלה כדי לראות גם שורות תרגול ללא ציון וקורסים עתידיים</span>
                </div>
                <div class="grades-table-wrap">
                    <table class="grades-table grades-raw-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>קוד מלא</th>
                                <th>שם הנושא / קורס</th>
                                <th>שנה"ל</th>
                                <th>קבוצה וסוג</th>
                                <th>ש"ש</th>
                                <th>נ"ז</th>
                                <th>ציון בגיליון</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rawRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function exportProgress() {
    const data = {
        completedCourses: [...completedCourses],
        selectedProgram: getCurrentProgramName(),
        normalPlacements,
        simManualDelays,
        appMode,
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biu_ee_plan_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function triggerImport() {
    document.getElementById('import-input')?.click();
}

function importProgress(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data.completedCourses)) {
                completedCourses = new Set(data.completedCourses);
                localStorage.setItem('completedCourses', JSON.stringify([...completedCourses]));
            }
            if (data.selectedProgram) localStorage.setItem('selectedProgram', data.selectedProgram);
            if (data.normalPlacements) normalPlacements = data.normalPlacements;
            if (data.simManualDelays) simManualDelays = data.simManualDelays;
            savePlacementsState();
            window.location.reload();
        } catch (err) {
            alert('שגיאה בייבוא הקובץ: קובץ JSON לא תקין.');
        }
    };
    reader.readAsText(file);
}

function setupResizer() {
    const resizer = document.getElementById('resizer');
    const details = document.getElementById('details');
    if (!resizer || !details) return;

    let isResizing = false;
    const savedWidth = localStorage.getItem('sidebarWidth');
    if (savedWidth) details.style.width = savedWidth + 'px';

    resizer.addEventListener('mousedown', () => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
    });

    window.addEventListener('mousemove', e => {
        if (!isResizing) return;
        const width = e.clientX;
        if (width > 240 && width < window.innerWidth * 0.55) {
            details.style.width = width + 'px';
            renderAll();
        }
    });

    window.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.cursor = 'default';
        localStorage.setItem('sidebarWidth', details.offsetWidth);
    });
}

function setupEventListeners() {
    window.addEventListener('resize', () => {
        renderAll();
    });

    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && (selectedCourseCode || document.getElementById('course-search')?.value)) {
            clearAllSelections();
        }
    });

    const graphView = document.getElementById('graph-view');
    if (graphView) {
        graphView.addEventListener('click', e => {
            if (!e.target.closest('.node-group') && selectedCourseCode) {
                clearSelectedCourse();
            }
        });
    }

    const progSelect = document.getElementById('program-select');
    if (progSelect) {
        progSelect.addEventListener('change', e => {
            const val = e.target.value;
            localStorage.setItem('selectedProgram', val);
            updateTrackToggles(val);
            renderAll();
        });
    }

    const searchInput = document.getElementById('course-search');
    const clearBtn = document.getElementById('clear-search-btn');
    if (searchInput) {
        searchInput.addEventListener('input', e => {
            if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
            renderAll();
        });
    }

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            ['graph', 'list', 'stats', 'grades'].forEach(v => {
                const el = document.getElementById(`${v}-view`);
                if (el) el.style.display = v === target ? 'block' : 'none';
            });
        });
    });
}

async function init() {
    try {
        if (window.BIU_DATA) {
            appData = window.BIU_DATA;
            setStatus(`נטענו ${appData.programs.length} תוכניות לתשפ"ז (Standalone)`);
            setupEventListeners();
            setupResizer();
            populateSelectors();
            return;
        }

        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        appData = await response.json();
        setStatus(`נטענו ${appData.programs.length} תוכניות לתשפ"ז`);
        setupEventListeners();
        setupResizer();
        populateSelectors();
    } catch (err) {
        console.error("Failed initializing dashboard:", err);
        setStatus(`שגיאה בטעינת הנתונים: ${err.message}`, true);
    }
}

init();
