local core = require("openmw.core")
local anim = require("openmw.animation")
local oSelf = require("openmw.self")
local types = require("openmw.types")
local I = require("openmw.interfaces")

local ctrls = oSelf.controls
local Actor = {
	isOnGround = types.Actor.isOnGround,
	isSwimming = types.Actor.isSwimming,
	stanceNone = types.Actor.STANCE.Nothing,
	stanceWeapon = types.Actor.STANCE.Weapon
}

local logLevel = 0
local sneakPlaying

local C = {}
C.first = {
	walk10 = 154.064,
	walk09 = 154.064 * 15 / 14,
--	sneak = 33.5452 * 2.8 * 15 / 44,
	sneak = 33.5452,
	run = 222.857
	}

local Anim = {

	cancel = anim.cancel,
	getActiveGroup = anim.getActiveGroup,
	getCompletion = anim.getCompletion,
	getTextKeyTime = anim.getTextKeyTime,
	hasGroup = anim.hasGroup,
	isPlaying = anim.isPlaying,
	playBlended = anim.playBlended,
	setSpeed = anim.setSpeed,

	idleControl = {
		idle = true, idlespell = true, idlehh = true
	}
}

Anim.armature = {
	firstPerson = {
		walkforward = { g="walkforward_base", velocity=C.first.walk10, max=10000 },
		walkback = { g="walkback_base", velocity=C.first.walk10, max=10000 },
		walkleft = { g="walkleft_base", velocity=C.first.walk10, max=10000 },
		walkright = { g="walkright_base", velocity=C.first.walk10, max=10000 },
		runforward = { g="runforward_base", velocity=C.first.run, max=10000 },
		runback = { g="runback_base", velocity=C.first.run, max=10000 },
		runleft = { g="runleft_base", velocity=C.first.run, max=10000 },
		runright = { g="runright_base", velocity=C.first.run, max=10000 },
		sneakforward = { g="sneakforward_base", velocity=C.first.sneak, max=10000 },
		sneakback = { g="sneakback_base", velocity=C.first.sneak, max=10000 },
		sneakleft = { g="sneakleft_base", velocity=C.first.sneak, max=10000 },
		sneakright = { g="sneakright_base", velocity=C.first.sneak, max=10000 },
		maxWalk = 10000, maxRun = 10000, maxSneak = 10000
	},
	thirdPerson = {
		walkforward = { g="walkforward_base15", velocity=154, max=10000 },
	--	idle = {},
		dynamicWalk = { maxSpeed = 10000 },
		maxWalk = 10000, maxRun = 10000
	},
	getTextKeyTime = anim.getTextKeyTime,
}

Anim.groups = require("scripts.DynamicAnimations.animations.standardGroups")
Anim.runningTime = 0
Anim.status = {}

local function debug(m, level)
	if logLevel >= (level or 1) then	print(m)		end
end

function Anim.armature:hasTextKey(g, k)
	return self.getTextKeyTime(oSelf, g .. ": " .. k) ~= nil
end

function Anim.armature:initialize(a)
	for k, v in next, a do
		if type(v) == "table" and v.g then
			v.hasSkipKey = self:hasTextKey(k, "skip start")
			v.hasLoopKey = self:hasTextKey(k, "loop start") and self:hasTextKey(k, "loop stop")
		end
	end
	a.odar_initialized = true
end

function Anim.zillaScale()
	if Anim.hasGroup(oSelf, "zillarescale") then
		debug("ZILLA BONE RESCALE")
		Anim.playBlended(oSelf, "zillarescale", { priority=11 })
	end
end

function Anim.getOverrides(move, groups)
	local overrides, none = {}, {}
	for k, v in next, groups do
		local a = Anim.groups[k] or none
		local speed, max, always
		if a.isWalk then
			speed = move.walkSpeed		max = groups.maxWalk
		elseif a.isRun then
			speed = move.runSpeed		max = groups.maxRun
		elseif a.isSneak and Anim.useLowerSneak then
			speed = move.walkSpeed		max = groups.maxSneak
			always = true
		end
		if speed then
			if speed < max and not always then
				v.max = 10000
			elseif v.g then
				overrides[k] = v
				if max < speed then	v.max = max		end
			end
		end
	end
	return overrides
end

function Anim:idleController()
	local g = self.getActiveGroup(oSelf, 0)
	if self.idleControl[g] then
		if not self.idleTimer then
			self.idleTimer = 0
		end
		self.setSpeed(oSelf, g, 1 - 0.05 * self.idleTimer)
		if self.idleTimer < 10 then
			self.idleTimer = self.idleTimer + 1
		end
	elseif not (g:find("^turn") or g:find("^spellturn")) then
		self.idleTimer = nil
	end
end

function Anim.sneakController(s)
	if not s.inFirst or not Anim.useLowerSneak then
		sneakPlaying = false
		return
	end
--	debug("ODAR SNEAK EVENT")
	if not s.sneak or s.stance == Actor.stanceWeapon then
		if sneakPlaying then
			Anim.cancel(oSelf, "idlesneak_base")		sneakPlaying = false
			debug("ODAR CANCEL SNEAK")
		end
		return
	end
--	if (s.sneak and not sneakPlaying) or (s.armatureChange and sneakPlaying) then
	if s.sneak and not Anim.isPlaying(oSelf, "idlesneak_base") then
		Anim.playBlended(oSelf, "idlesneak_base",
			{ priority={ [0] = 1 }, blendMask=1, forceLoop=true, loops=10000,
				startKey=s.armatureChange and "loop start" or nil
			})
		sneakPlaying = true
		debug("ODAR PLAY SNEAK")
	end
end

function Anim.cancelAll()
	debug("ODAR CANCEL EVENT")
	if sneakPlaying then
		Anim.cancel(oSelf, "idlesneak_base")		sneakPlaying = false
		debug("ODAR CANCEL SNEAK")
	end
end

function Anim:jumpController()
	local a = self.groups[self.getActiveGroup(oSelf, 0)] or {}
	if self.status.isOnGround then
		if a.isRun then
			self.runningTime = self.runningTime + 1
		elseif self.runningTime > 0 then
		--	print("RUNTIMER RESET")
			self.runningTime = 0
		end
	end
	if self.fallStart then
		if (self.status.isOnGround or self.status.isSwimming) then
		--	print("ONUPDATE: FALLING CANCEL")
			self.fallStart = nil
		elseif a.isJump then
			local z = oSelf.position.z
			self.fallStart = self.fallStart < z and z or self.fallStart
		end
	end
end

Anim.lastLocomotion = { g = "", findg = "", group = "", direction = 4, endTime = 0, endPoint = 0 }

function Anim:locomotionFixes(g, o, a)
	if not self.animFixes then		return		end

	local hasKeys = o.startKey == "start" and o.stopKey == "stop"
	if hasKeys and self.armatureChange and not self.status.inFirst then
	--	self.armatureChange = false
		local loopStart = self.getTextKeyTime(oSelf, g .. ": loop start")
		local loopStop = self.getTextKeyTime(oSelf, g .. ": loop stop")
		local stop = self.getTextKeyTime(oSelf, g .. ": stop")
		if loopStart and loopStop and stop then
			local start = self.getTextKeyTime(oSelf, g .. ": start")
			o.startPoint = math.abs((loopStart - start) / (stop - start))
			o.startPoint = math.max(o.startPoint, 0.5)
		--	o.startPoint = 0.5
		--	if g == "runforward" and math.abs(loopStop - 1.2) < 0.01 then
		--		o.startPoint = 0.8 * (loopStop - loopStart) / (stop - loopStart)
		--	end
		--	print("VIEWCHANGE FIX", g, o.startPoint)
		end
		return
	end
	if hasKeys and a.movement and not a.isSwim then
		local last = self.lastLocomotion
		local lastDirection = self.groups[last.baseGroup] or {}
		lastDirection = lastDirection.movement
		if a.movement == lastDirection and core.getSimulationTime() - last.endTime < 0.1 then
			local k1 = self.getTextKeyTime(oSelf, g .. ": loop stop")
			local k2 = self.getTextKeyTime(oSelf, last.g .. ": loop stop")
			local k3 = self.getTextKeyTime(oSelf, g .. ": start")
			local k4 = self.getTextKeyTime(oSelf, g .. ": loop start")
			local k5 = self.getTextKeyTime(oSelf, g .. ": stop")
			if k1 and k2 and math.abs(k1 - k2) < 0.01 then
				o.startPoint = last.endPoint
			--	print(g, last.g, o.startPoint, k1, k2)
			elseif k3 and k4 and k5 then
				o.startPoint = math.max(0, math.min(0.99, (k4 - k3) / (k5 - k3)))
			--	print(g, last.g, o.startPoint, k3, k4, k5)
			end
		end
		last.g = g		last.baseGroup = g
	end

	if self.noWalking then		return		end


	if a.isJump then
		if self.fallStart and (self.status.isOnGround or self.status.isSwimming) then
			local height = self.fallStart - oSelf.position.z
		--	print(o.startKey, o.stopKey, height, ctrls.jump, ctrls.movement, self.runningTime)
			o.speed = height > 300 and 0.5 or height > 200 and 0.7 or 1
			self.fallStart = nil
		elseif not self.fallStart then
			self.fallStart = oSelf.position.z
		end
	elseif self.fallStart and a.movement then
		local height = self.fallStart - oSelf.position.z
		self.fallStart = nil
	--	print(o.startKey, o.stopKey, height, ctrls.movement, self.runningTime)
		if hasKeys and a.isRun and height < 200 and self.runningTime > 1 then
			local start = self.getTextKeyTime(oSelf, g .. ": start")
			local loopStart = self.getTextKeyTime(oSelf, g .. ": loop start") or start
			local loopStop = self.getTextKeyTime(oSelf, g .. ": loop stop")
			local stop = self.getTextKeyTime(oSelf, g .. ": stop")
			if g == "runforward" and math.abs(loopStop - 1.2) < 0.01 then
			--	o.startKey = "loop start"		o.stopKey = "stop"
				o.startPoint = 0.74
			elseif start and stop then
				o.startPoint = (loopStart - start) / (stop - start)
			end
		--	print("MOVE INSTANT", o.startPoint)
		end
	end
end


return Anim
