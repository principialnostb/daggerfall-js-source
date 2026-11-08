// @ts-check
// Moving fists use the ordinary locomotion clips; stopping restores the guard.
export function guardTraveling(word) {
  return !!word && word.speed > 0.1 && Math.hypot(word.forward || 0, word.strafe || 0) > 0
    && !word.blow && word.grounded !== false && !word.swimming && !word.levitating;
}
