local base = {

	walkforward = { isWalk=true, isLocomotion=true, movement=0 },
	walkback = { isWalk=true, isLocomotion=true, movement=1 },
	walkleft = { isWalk=true, isLocomotion=true, movement=2 },
	walkright = { isWalk=true, isLocomotion=true, movement=3 },
	runforward = { isRun=true, isLocomotion=true, movement=0 },
	runback = { isRun=true, isLocomotion=true, movement=1 },
	runleft = { isRun=true, isLocomotion=true, movement=2 },
	runright = { isRun=true, isLocomotion=true, movement=3 },
	sneakforward = { isSneak=true, isLocomotion=true, movement=0 },
	sneakback = { isSneak=true, isLocomotion=true, movement=1 },
	sneakleft = { isSneak=true, isLocomotion=true, movement=2 },
	sneakright = { isSneak=true, isLocomotion=true, movement=3 },
	jump = { isJump=true },
	idle = {},
}

local groups = {
	swimforward = { isSwim=true, isLocomotion=true, movement=0 },
	swimback = { isSwim=true, isLocomotion=true, movement=1 },
	swimleft = { isSwim=true, isLocomotion=true, movement=2 },
	swimright = { isSwim=true, isLocomotion=true, movement=3 },
	swimrunforward = { isSwim=true, isSwimRun=true, isLocomotion=true, movement=0 },
	swimrunback = { isSwim=true, isSwimRun=true, isLocomotion=true, movement=1 },
	swimrunleft = { isSwim=true, isSwimRun=true, isLocomotion=true, movement=2 },
	swimrunright = { isSwim=true, isSwimRun=true, isLocomotion=true, movement=3 },
}

for _, wpn in ipairs{ "", "1h", "2c", "2w", "hh", "1s", "1b", "2b", "bow", "crossbow", "1t" } do
	for k, v in pairs(base) do
		groups[k .. wpn] = v
	end
end
base = nil

return groups
