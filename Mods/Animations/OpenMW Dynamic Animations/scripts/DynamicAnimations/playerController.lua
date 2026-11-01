local core = require("openmw.core")
local anim = require("openmw.animation")
local I = require("openmw.interfaces")
local types = require("openmw.types")
local self = require("openmw.self")
local camera = require("openmw.camera")
local async = require("openmw.async")

local ctrls = self.controls
local Actor = {
	getStance = types.Actor.getStance,
	stanceNone = types.Actor.STANCE.Nothing,
	isSwimming = types.Actor.isSwimming,
	activeEffects = types.Actor.activeEffects(self),
	isWerewolf = types.NPC.isWerewolf,
}

local logSpam = false
local spamNames = { ["torch"] = true, ["idle1h"] = true, ["idle2c"] = true, ["idlehh"] = true }
local spamNames = {}

local cam = { getMode = camera.getMode, first = camera.MODE.FirstPerson }
local camMode, inFirst

local disabled = false

local handlers = { armatureChange={}, combatChange={}, statusChange={} }

local getStance = types.Actor.getStance
local getCamMode = camera.getMode
local status = {}
local statusChange, isSneaking, actorStance


--	DEV OPTIONS
local logLevel = 0


local function debug(m, level)
	if logLevel >= (level or 1) then	print(m)		end
end

local playBlendedHandlers = {}
local function onPlayBlendedAnimation(g, o)
    for i = #playBlendedHandlers, 1, -1 do
        local h = playBlendedHandlers[i].fn(g, o)
        if type(o.newGroupName) == "string" then
            g = o.newGroupName
            o.newGroupName = nil
        end
        if h == false then
            break
        end
    end
    return g
end

local function viewChange()
	camMode = getCamMode()
	local intoFirst = camMode == cam.first
	if inFirst ~= intoFirst then
		inFirst = intoFirst		status.inFirst = intoFirst
		statusChange = true		status.armatureChange = true
		for _, v in ipairs(handlers.armatureChange) do
			v(intoFirst)
		end
		debug("ODAR EVENT: ARMATURE CHANGE")
	end
end

viewChange()
--	camMode = nil

local function playBlendedAnimation(g, o)
	if camMode ~= getCamMode() then
		viewChange()
	end
	if disabled then return end
	o = o or {}
	if logLevel > 1 then
		if not spamNames[g] then
			print(g, o.priority, o.blendMask)
		else
			if not logSpam then
				logSpam = true
				print(g, o.priority, o.blendMask)
			end
		end
	end
	local swap = onPlayBlendedAnimation(g, o)
	if swap ~= g and not o.skip then
		anim.playBlended(self, swap, o)
		o.skip = true
		return false
	end
end


I.AnimationController.addPlayBlendedAnimationHandler(playBlendedAnimation)

local function onUpdate(dt)
	if dt <= 0 then		return		end
	local change = statusChange
	if isSneaking ~= ctrls.sneak then
		change = true
		isSneaking = ctrls.sneak		status.sneak = isSneaking
	end
	if actorStance ~= getStance(self) then
		change = true
		actorStance = getStance(self)		status.stance = actorStance
	end
	if change then
		statusChange = false
		for _, v in ipairs(handlers.statusChange) do
			v(status)
		end
		status.armatureChange = false
		debug("ODAR STATUS UPDATE")
	end
end

onUpdate(1)

-- fix for camera weirdness when OpenMW is first loaded
async:newUnsavableSimulationTimer(1, function()
	if inFirst and not anim.hasGroup(self, "idlesneak_base") then
	--	print("FIRST LOAD CAM CORRECTION")
		camMode = getCamMode()
		inFirst = camMode == cam.first
	end
end)

local attackers, inCombat = {}


return {
	engineHandlers = {
		onUpdate = onUpdate
	},
	eventHandlers = {
		OMWMusicCombatTargetsChanged = function(e)
			if not e.actor then		return			end
			local targetPlayer
			if e.targets and next(e.targets) ~= nil then
				for _, target in ipairs(e.targets) do
					if target == self.object then
						targetPlayer = true
						break
					end
				end
			end
			if attackers[e.actor.id] ~= targetPlayer then
				attackers[e.actor.id] = targetPlayer
			-- Don't sendEvent to inactive actors
				if targetPlayer then
					e.actor:sendEvent("odarEvent", {event="updateAI"})
				end
			end
			targetPlayer = (next(attackers) ~= nil)
			if inCombat ~= targetPlayer then
				inCombat = targetPlayer
				debug("ODAR INCOMBAT"..tostring(targetPlayer))
				for _, v in ipairs(handlers.combatChange) do
					v(targetPlayer)
				end
			end
		end,
		PlayBlendedAnimation = function(e)
			I.AnimationController.playBlendedAnimation(e.groupName, e.options)
			return false
		end,
		CancelAnimation = function(e)
			anim.cancel(self, e)
		end,
		RemoveVfx = function(e)		anim.removeVfx(self, e)		end,
	},

	interfaceName = "ODAR",
	interface = {
		version = 115,
		addPlayBlendedAnimationHandler = function(handler, name)
			if type(name) ~= "string" then name = tostring(#playBlendedHandlers + 1) end
			playBlendedHandlers[#playBlendedHandlers + 1] = {id=name, fn=handler}
			debug("ODAR handler "..name.." registered.")
		end,
		addEventHandler = function(eventName, handler)
			local event = handlers[eventName]
			if event then
				event[#event + 1] = handler
			end
		end,

		setLogLevel = function(e)	logLevel = e			end,
		enabled = function(e)		disabled = not e		end,

	--	cam = function()		return camMode				end,
	--	debug = function()		return { attackers, status }		end
	}
}
