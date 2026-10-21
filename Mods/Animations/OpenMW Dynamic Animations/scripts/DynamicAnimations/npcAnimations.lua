local oSelf = require("openmw.self")
local types = require("openmw.types")
local core = require("openmw.core")
local I = require("openmw.interfaces")
local anim = require("openmw.animation")
local util = require("openmw.util")
local async = require("openmw.async")

--	local aux_util = require("openmw_aux.util")

local getActorSpeed = types.Actor.getCurrentSpeed
local actorSpeed = 0
local isPlaying = anim.isPlaying
local L = {
	activeEffects = types.Actor.activeEffects(oSelf),
	getActorSpeed = types.Actor.getCurrentSpeed,
	getStance = types.Actor.getStance,
	isInActorsProcessingRange = types.Actor.isInActorsProcessingRange,
	isSwimming = types.Actor.isSwimming,
	stanceNothing = types.Actor.STANCE.Nothing,
	odarControls = I.ODAR.selfControls,

	isWerewolf = types.NPC.isWerewolf,
	playBlended = I.AnimationController.playBlendedAnimation,
	controls = oSelf.controls
}

local swaps
local skipUpdate = true
local AI = {}
local moveControl, playSwaps, maxTurn
local player = oSelf
local disabled = true
local block = false
local settings = { random = math.random() }
local walk = {
	controllerEnabled = false,
	g="", o={}, maxSpeed=300,
	f = "walkforward", noble = "walkforward_noble13",
	walkfOpt = { loops=200, forceLoop=true, priority=5 },
	pTable = { [0] = 5, [1] = 5, [2] = 4, [3] = 4 },
	actorSpeed = 0
}
local anims = { n = 0 }

local logLevel = 0


local function debug(m, l)
	if logLevel >= (l or 1) then		print(m)		end
end

local function playHandler(a)
	local delayed = a.delayed		a.delayed = nil
	if not(playSwaps or anims.idle1_canPlay) or L.getStance(oSelf) ~= L.stanceNothing then
	--	playSwaps = false
		return
	end
	local g, o = a.g, a.o
	local mask = anims.shield and 11
	mask = mask or ((isPlaying(oSelf, "idlestorm") or isPlaying(oSelf, "torch")) and 15)
	if mask then
		mask = util.bitAnd(o.blendMask or 15, mask)
		g = g ~= "armsfolded" and g or "armsakimbo"
	end
	if mask == 0 then		return			end

	if g:find("^arms") then
		anim.cancel(oSelf, g)
		local arm = anim.getActiveGroup(oSelf, 3)
		if not delayed and arm:find("^arms") and g:match("[^_]+") ~= arm:match("[^_]+") then
			anim.cancel(oSelf, arm)		a.delayed = true
		--	print("ARMS DELAYED", g, arm)
			async:newUnsavableSimulationTimer(1, function() playHandler(a)		end)
			return
		end
	end
	if mask then
		local savedMask = o.blendMask		o.blendMask = mask
		anim.playBlended(oSelf, g, o)		o.blendMask = savedMask
	else
		anim.playBlended(oSelf, g, o)
	end
end

local function walkHandler(g, o)
	if o.priority ~= 5 then		return		end
	local clone = {}
--	for k, v in pairs(o) do		clone[k] = v		end
	for k, v in next, o do		clone[k] = v		end
	walk.actorSpeed = getActorSpeed(oSelf)
	o.speed = math.min(walk.maxSpeed, walk.actorSpeed) / walk.velocity
	walk.parent = g			g = walk.wander

	-- Bugfix for spellcast group cancelling custom walk anim
	if isPlaying(oSelf, g) then
		if g == walk.playing and walk.playOptions.blendMask ~= o.blendMask then
			o.startPoint = anim.getCompletion(oSelf, g)
			anim.cancel(oSelf, g)
		end
	end

	walk.playOptions = clone
	walk.playing = g
--	skipUpdate = false

	L.playBlended(g, o)

	o.priority = walk.pTable	o.blendMask = 0
	o.startKey = "skip start"	o.stopKey = "skip stop"		o.forceLoop = true
	o.speed = 0.2			o.startPoint = 0

	anim.playBlended(oSelf, walk.parent, o)
	o.skip = true
	
	return false

end

local function switchHandler(g, o)
	local switch = swaps[g]
	-- debug logging
	if logLevel > 1 and g ~= "torch" then
		print(g, o.priority, o.loops, switch)
	end
	if switch.priority and switch.priority ~= o.priority then
		return
	end
	if switch.modify then
		for k, v in pairs(switch.modify) do
			if k == "speeds" then
				o.speed = v[math.random(#v)]
			else
				o[k] = v
			end
		end
	end
	if switch.interval then
		local t = switch.nextPlay
		if not t or t < core.getSimulationTime() then
			switch.nextPlay = core.getSimulationTime() + switch.interval
		else
			return
		end
	end
	if switch.n then
		switch.c = (switch.c or (math.random(switch.n) - 1)) + 1
		if switch.c > switch.n then switch.c = 1		end
		switch = switch[switch.c] or {}
	end
	if switch.masks then
		switch.o.blendMask = switch.masks[math.random(#switch.masks)]
	end
	if switch.g then
		if switch.priority ~= 0 then
			anim.cancel(oSelf, switch.g)
		end
		if not switch.parent then	switch.parent = g		end
		table.insert(anims, switch)	anims.n = #anims
		playHandler(switch)
	end
end

-- local function switchAnimation(g, o)
I.ODAR.addPlayBlendedAnimationHandler(function (g, o)

	if playSwaps and swaps[g] then
		switchHandler(g, o)
	end

	if g == "walkforward" and moveControl then
		return walkHandler(g, o)
	end

end)


local function initSwaps(e)
	if type(e) ~= "table" or e.settings then
		return
	end
--	print(aux_util.deepToString(e, 5))

	disabled = false			swaps = e
	local m = e.odar_wander
	if m then
		walk.wander = m.g		walk.velocity = m.velocity
		walk.speedCap = m.maxSpeed or 300
		walk.controllerEnabled = true
		local isMale = oSelf.type.records[oSelf.recordId].isMale
		walk.speeds = {
			low = 77,
		--	low = isMale and 77 or 62,
			mid = 92,
			high = 108
		}
	else
		walk.wander = nil		walk.controllerEnabled = false
	end
	if e.odar_config then
		settings = e.odar_config		e.odar_config = nil
	--	anims.shield = (settings.shields or not anim.hasBone(oSelf, "Bip01 AttachShield"))
		if anim.hasAnimation(oSelf) and not anim.hasBone(oSelf, "Bip01 AttachShield") then
			settings.shields = true
		end
		anims.shield = settings.shields
			and types.Actor.getEquipment(oSelf, types.Actor.EQUIPMENT_SLOT.CarriedLeft)
		walk.controllerEnabled = settings.move and walk.controllerEnabled
		playSwaps = settings.anims == true
		player = settings.player or player
		for i = 1, math.ceil((settings.random or 0.5) * 20) do	math.random()		end
	end
	AI = I.ODAR.getAIStatus()
	AI.wander = AI.type == "Wander" and type(AI.distance) == "number"
	local idle1 = e.odar_idle1_idles
	if idle1 then
		idle1.n = math.random(#idle1)		idle1.timer = idle1.timer or math.random(10)
		if not idle1.static then
			anims.idle1_idles = idle1
		elseif not AI.type or (AI.wander and AI.distance == 0) then
			anims.idle1_idles = idle1
		end
	end

--	debug("swap table loaded")
end

-- core.sendGlobalEvent("sendSwaps", oSelf)

local function stopWalk()
--	skipUpdate = true
	if walk.playing and not isPlaying(oSelf, walk.parent) then
		anim.cancel(oSelf, walk.playing)
		walk.playing = nil
		debug("WALK CANCEL", 2)
	end
end
walk.callback = stopWalk

function anims:cancel()
	for i = self.n, 1, -1 do
		local v = self[i].g
		if isPlaying(oSelf, v) then
			debug(("Cancel %s"):format(v))
			anim.cancel(oSelf, v)
		end
		self[i] = nil
	end
	self.n = 0
	anim.cancel(oSelf, "armsakimbo")
	if self.idle1 then
		anim.cancel(oSelf, self.idle1_idles.g)		self.idle1 = false
	end
end

function anims:update()
	for i = self.n, 1, -1 do
		local a = self[i]
		if not a.delayed and not isPlaying(oSelf, a.g) then
			debug(("Anim ended %s"):format(a.g))
			table.remove(self, i)		self.n = self.n - 1
		end
	end
	if not self.idle1_canPlay then		return		end

	AI.anim[0] = anim.getActiveGroup(oSelf, 0)
	local idles = self.idle1_idles		local a = idles[idles.n]
	if AI.anim[0] == "idle" then
		local g = anim.getActiveGroup(oSelf, 1)		AI.anim[1] = g
		if g == "idle" or g == a.g then
			idles.timer = idles.timer - 1
			if idles.timer <= 0 then
				anim.setSpeed(oSelf, "idle", 0.5)
				anim.cancel(oSelf, a.g)
				idles.n = 1 + (idles.n < #idles and idles.n or 0)
				a = idles[idles.n]		playHandler(a)
				idles.timer = a.duration	self.idle1 = true
			end
		end
	else
		idles.timer = 5
		if self.idle1 then
			anim.cancel(oSelf, a.g)		self.idle1 = false	AI.anim[1] = nil
		end
	end
end

local function updateAI()
	maxTurn = nil			playSwaps = false
	AI.blocked = disabled or not swaps or not L.isInActorsProcessingRange(oSelf)
		or L.activeEffects:getEffect("levitate").magnitude > 0 or L.isSwimming(oSelf)
		or L.isWerewolf(oSelf) or L.controls.sneak
	if not AI.blocked and anims.idle1_idles then
		local t = AI.type
		if not AI.combat and (AI.wander or t == nil or t == "Follow" or t == "Travel") then
			anims.idle1_canPlay = settings.anims == true
		end
	end
	if AI.blocked or not AI.wander then
		if moveControl then
			if walk.playing and anim.isPlaying(oSelf, walk.parent) then
				walk.playOptions.startPoint = anim.getCompletion(oSelf, walk.playing)
				anim.cancel(oSelf, walk.parent)
				anim.playBlended(oSelf, walk.parent, walk.playOptions)
			end
			L.odarControls(false)		moveControl = false
		end
		return
	end

	playSwaps = settings.anims and AI.stance == L.stanceNothing
	if not walk.controllerEnabled then
		return
	end

--	debug("WANDER ACTIVE", 2)
	local d = AI.distance		AI.playerDistance = (player.position - oSelf.position):length()
	if d == 0 then
		if AI.playerDistance < 1500 then
			maxTurn = math.pi ; walk.maxTurn = maxTurn
			if not moveControl and not L.odarControls() then
				L.odarControls(walk) ; moveControl = true
			end
		else
			if moveControl then
				L.odarControls(false) ; moveControl = false
			end
		end
		return
	end

	if not moveControl and not L.odarControls() then
		L.odarControls(walk)
	end
	local s = ( d < 300 and 77) or (d < 1000 and 92) or (d < 1500 and 108) or 123
--	local s = ( d < 300 and 77) or (d < 500 and 92) or (d < 1000 and 100) or (d < 1500 and 115) or 130
--	local s = ( d < 300 and 0.5) or (d < 500 and 0.6) or (d < 700 and 0.7) or (d < 1000 and 0.7) or 0.9
	s = math.min(s, walk.speedCap)
	s = math.min(s, types.Actor.getWalkSpeed(oSelf))
	maxTurn = d < 300 and 1.75 or d < 500 and 1.75 or d <= 1000 and 1.5 or d <= 1500 and 1.75 or 2
	maxTurn = maxTurn * math.pi
	local group = (s < 80 and swaps.walkforward_05) or (s < 120 and swaps.walkforward_07)
		or swaps.odar_wander
	walk.wander = group.g			walk.velocity = group.velocity or 154
	walk.maxSpeed = s
	walk.maxTurn = AI.playerDistance < 5000 and maxTurn

	if not moveControl and anim.getActiveGroup(oSelf, 0) == walk.f and not walk.playing then
		debug("WALK OVERRIDE")
		local o = { loops=1000, forceLoop=true, priority=5 }
		o.startPoint = anim.getCompletion(oSelf, walk.f)
		anim.cancel(oSelf, walk.f)
		walkHandler(walk.f, o)
	end
	moveControl = true
end

I.ODAR.addEventHandler("onSecond", function()
	updateAI()
	if playSwaps or anims.idle1_canPlay or anims.idle1 then
		anims:update()
	end
--[[
	block = false
	if timer > 2 then
		timer = 0	block = false
	end
--]]
end)

I.ODAR.addEventHandler("AIChange", function(p)
	debug(("AI PACKAGE UPDATE %s"):format(p.type))
	AI = p			local t = p.type
	p.wander = t == "Wander" and type(p.distance) == "number"
	p.combat = p.stance ~= L.stanceNothing or t == "Combat"
	if p.combat and (playSwaps or anims.idle1) then
		anims:cancel()
	end
	updateAI()
end)


return {
	engineHandlers = {
		onInit = initSwaps
	},
	eventHandlers = {
		initSwaps = initSwaps,
		odarEnabled = function(e)
			disabled = type(swaps) ~= "table" or e == false
			updateAI()
			debug(("ODAR enabled %s"):format(not disabled))
		end,
		updateAI = updateAI
	},
	interfaceName = "anim",
	interface = {
		version = 114,
		logLevel = function(e)	logLevel = e		end,
		disable = function(e)
			disabled = type(swaps) ~= "table" or e
		end,
--[[
		swaps = function()		return swaps		end,
		active = function()		return anims	end,
		status = function()
			return { disabled, playSwaps, moveControl, maxTurn }
		end,
		ai = function()			return AI		end,
		walk = function()		return walk		end,
--]]
	}
}
