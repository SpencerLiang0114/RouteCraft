//! Compatibility sorting for the legacy non-transitive 150 m destination comparator.
//! Run detection, binary insertion, merge scheduling and galloping follow Java 21
//! TimSort behavior. All moves use Copy values; no unsafe storage is needed.
use std::cmp::Ordering;
fn gallop<T: Copy>(
    key: T,
    a: &[T],
    hint: usize,
    right: bool,
    cmp: &impl Fn(&T, &T) -> Ordering,
) -> usize {
    let precedes = |v: &T| {
        if right {
            cmp(&key, v) != Ordering::Less
        } else {
            cmp(&key, v) == Ordering::Greater
        }
    };
    let mut last = 0isize;
    let mut offset = 1isize;
    let hint = hint as isize;
    if precedes(&a[hint as usize]) {
        let max = a.len() as isize - hint;
        while offset < max && precedes(&a[(hint + offset) as usize]) {
            last = offset;
            offset = offset * 2 + 1;
        }
        offset = offset.min(max);
        last += hint;
        offset += hint;
    } else {
        let max = hint + 1;
        while offset < max && !precedes(&a[(hint - offset) as usize]) {
            last = offset;
            offset = offset * 2 + 1;
        }
        offset = offset.min(max);
        let tmp = last;
        last = hint - offset;
        offset = hint - tmp;
    }
    last += 1;
    while last < offset {
        let mid = last + (offset - last) / 2;
        if precedes(&a[mid as usize]) {
            last = mid + 1;
        } else {
            offset = mid;
        }
    }
    offset as usize
}
fn merge<T: Copy>(
    a: &mut [T],
    base: usize,
    mut n: usize,
    mut m: usize,
    min_gallop: &mut i32,
    cmp: &impl Fn(&T, &T) -> Ordering,
) {
    let second = base + n;
    let skip = gallop(a[second], &a[base..second], 0, true, cmp);
    let base = base + skip;
    n -= skip;
    if n == 0 {
        return;
    }
    m = gallop(a[base + n - 1], &a[second..second + m], m - 1, false, cmp);
    if m == 0 {
        return;
    }
    let mut mg = *min_gallop;
    if n <= m {
        let tmp = a[base..base + n].to_vec();
        let mut i = 0;
        let mut j = second;
        let mut d = base;
        a[d] = a[j];
        d += 1;
        j += 1;
        m -= 1;
        if m > 0 && n > 1 {
            'outer: loop {
                let mut wins_a = 0;
                let mut wins_b = 0;
                loop {
                    if cmp(&a[j], &tmp[i]) == Ordering::Less {
                        a[d] = a[j];
                        d += 1;
                        j += 1;
                        wins_b += 1;
                        wins_a = 0;
                        m -= 1;
                        if m == 0 {
                            break 'outer;
                        }
                    } else {
                        a[d] = tmp[i];
                        d += 1;
                        i += 1;
                        wins_a += 1;
                        wins_b = 0;
                        n -= 1;
                        if n == 1 {
                            break 'outer;
                        }
                    }
                    if (wins_a | wins_b) >= mg {
                        break;
                    }
                }
                loop {
                    let count_a = gallop(a[j], &tmp[i..i + n], 0, true, cmp);
                    a[d..d + count_a].copy_from_slice(&tmp[i..i + count_a]);
                    d += count_a;
                    i += count_a;
                    n -= count_a;
                    if n <= 1 {
                        break 'outer;
                    }
                    a[d] = a[j];
                    d += 1;
                    j += 1;
                    m -= 1;
                    if m == 0 {
                        break 'outer;
                    }
                    let count_b = gallop(tmp[i], &a[j..j + m], 0, false, cmp);
                    a.copy_within(j..j + count_b, d);
                    d += count_b;
                    j += count_b;
                    m -= count_b;
                    if m == 0 {
                        break 'outer;
                    }
                    a[d] = tmp[i];
                    d += 1;
                    i += 1;
                    n -= 1;
                    if n == 1 {
                        break 'outer;
                    }
                    mg -= 1;
                    if count_a < 7 && count_b < 7 {
                        break;
                    }
                }
                mg = mg.max(0) + 2;
            }
        }
        if n == 1 {
            a.copy_within(j..j + m, d);
            a[d + m] = tmp[i];
        } else if n > 0 {
            a[d..d + n].copy_from_slice(&tmp[i..i + n]);
        }
    } else {
        let tmp = a[second..second + m].to_vec();
        let mut i = (base + n - 1) as isize;
        let mut j = (m - 1) as isize;
        let mut d = (second + m - 1) as isize;
        a[d as usize] = a[i as usize];
        d -= 1;
        i -= 1;
        n -= 1;
        if n > 0 && m > 1 {
            'outer: loop {
                let mut wins_a = 0;
                let mut wins_b = 0;
                loop {
                    if cmp(&tmp[j as usize], &a[i as usize]) == Ordering::Less {
                        a[d as usize] = a[i as usize];
                        d -= 1;
                        i -= 1;
                        wins_a += 1;
                        wins_b = 0;
                        n -= 1;
                        if n == 0 {
                            break 'outer;
                        }
                    } else {
                        a[d as usize] = tmp[j as usize];
                        d -= 1;
                        j -= 1;
                        wins_b += 1;
                        wins_a = 0;
                        m -= 1;
                        if m == 1 {
                            break 'outer;
                        }
                    }
                    if (wins_a | wins_b) >= mg {
                        break;
                    }
                }
                loop {
                    let count_a = n - gallop(tmp[j as usize], &a[base..base + n], n - 1, true, cmp);
                    d -= count_a as isize;
                    i -= count_a as isize;
                    n -= count_a;
                    a.copy_within(
                        (i + 1) as usize..(i + 1) as usize + count_a,
                        (d + 1) as usize,
                    );
                    if n == 0 {
                        break 'outer;
                    }
                    a[d as usize] = tmp[j as usize];
                    d -= 1;
                    j -= 1;
                    m -= 1;
                    if m == 1 {
                        break 'outer;
                    }
                    let count_b = m - gallop(a[i as usize], &tmp[..m], m - 1, false, cmp);
                    d -= count_b as isize;
                    j -= count_b as isize;
                    m -= count_b;
                    a[(d + 1) as usize..(d + 1) as usize + count_b]
                        .copy_from_slice(&tmp[(j + 1) as usize..(j + 1) as usize + count_b]);
                    if m <= 1 {
                        break 'outer;
                    }
                    a[d as usize] = a[i as usize];
                    d -= 1;
                    i -= 1;
                    n -= 1;
                    if n == 0 {
                        break 'outer;
                    }
                    mg -= 1;
                    if count_a < 7 && count_b < 7 {
                        break;
                    }
                }
                mg = mg.max(0) + 2;
            }
        }
        if m == 1 {
            d -= n as isize;
            i -= n as isize;
            a.copy_within((i + 1) as usize..(i + 1) as usize + n, (d + 1) as usize);
            a[d as usize] = tmp[j as usize];
        } else if m > 0 {
            a[(d + 1 - m as isize) as usize..(d + 1) as usize].copy_from_slice(&tmp[..m]);
        }
    }
    *min_gallop = mg.max(1);
}
pub fn sort<T: Copy>(a: &mut [T], cmp: impl Fn(&T, &T) -> Ordering) {
    if a.len() < 2 {
        return;
    }
    let mut min = a.len();
    let mut r = 0;
    while min >= 32 {
        r |= min & 1;
        min >>= 1;
    }
    min += r;
    let mut runs: Vec<(usize, usize)> = Vec::new();
    let mut base = 0;
    let mut min_gallop = 7;
    let merge_at = |runs: &mut Vec<(usize, usize)>, i: usize, a: &mut [T], mg: &mut i32| {
        let (b, n) = runs[i];
        let m = runs[i + 1].1;
        runs[i].1 += m;
        runs.remove(i + 1);
        merge(a, b, n, m, mg, &cmp);
    };
    while base < a.len() {
        let mut end = base + 1;
        if end < a.len() {
            let descending = cmp(&a[end], &a[base]) == Ordering::Less;
            end += 1;
            while end < a.len()
                && (if descending {
                    cmp(&a[end], &a[end - 1]) == Ordering::Less
                } else {
                    cmp(&a[end], &a[end - 1]) != Ordering::Less
                })
            {
                end += 1;
            }
            if descending {
                a[base..end].reverse();
            }
        }
        let extended = (base + min).min(a.len()).max(end);
        for i in end..extended {
            let pivot = a[i];
            let mut lo = base;
            let mut hi = i;
            while lo < hi {
                let mid = lo + (hi - lo) / 2;
                if cmp(&pivot, &a[mid]) == Ordering::Less {
                    hi = mid;
                } else {
                    lo = mid + 1;
                }
            }
            a.copy_within(lo..i, lo + 1);
            a[lo] = pivot;
        }
        runs.push((base, extended - base));
        base = extended;
        while runs.len() > 1 {
            let mut n = runs.len() - 2;
            if (n > 0 && runs[n - 1].1 <= runs[n].1 + runs[n + 1].1)
                || (n > 1 && runs[n - 2].1 <= runs[n - 1].1 + runs[n].1)
            {
                if runs[n - 1].1 < runs[n + 1].1 {
                    n -= 1;
                }
            } else if runs[n].1 > runs[n + 1].1 {
                break;
            }
            merge_at(&mut runs, n, a, &mut min_gallop);
        }
    }
    while runs.len() > 1 {
        let mut n = runs.len() - 2;
        if n > 0 && runs[n - 1].1 < runs[n + 1].1 {
            n -= 1;
        }
        merge_at(&mut runs, n, a, &mut min_gallop);
    }
}
