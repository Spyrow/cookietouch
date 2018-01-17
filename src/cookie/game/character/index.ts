import Account from "@account";
import { AccountStates } from "@account/AccountStates";
import DataManager from "@protocol/data";
import Breeds from "@protocol/data/classes/Breeds";
import Spells from "@protocol/data/classes/Spells";
import { BreedEnum } from "@protocol/enums/BreedEnum";
import { PlayerLifeStatusEnum } from "@protocol/enums/PlayerLifeStatusEnum";
import EntityLook from "@protocol/network/types/EntityLook";
import LiteEvent from "@utils/LiteEvent";
import { BoostableStats } from "./BoostableStats";
import CharacterStats from "./CharacterStats";
import Inventory from "./inventory";
import Jobs from "./jobs";
import Mount from "./mount";
import { PlayerStatusEnum } from "./PlayerStatusEnum";
import SpellEntry from "./SpellEntry";

export default class Character {
  public breedData: Breeds;
  public isSelected: boolean;
  public name: string;
  public id: number;
  public level: number;
  public skinUrl: string;
  public status: PlayerStatusEnum;
  public sex: boolean;
  public breed: BreedEnum;
  public look: EntityLook;
  public stats: CharacterStats;
  public lifeStatus: PlayerLifeStatusEnum;
  public spells: SpellEntry[];
  public mount: Mount;
  public jobs: Jobs;
  public inventory: Inventory;

  private regenTimer: NodeJS.Timer = null;

  public get CharacterSelected() { return this.onCharacterSelected.expose(); }
  public get StatsUpdated() { return this.onStatsUpdated.expose(); }
  public get SpellsUpdated() { return this.onSpellsUpdated.expose(); }
  private readonly onCharacterSelected = new LiteEvent<void>();
  private readonly onStatsUpdated = new LiteEvent<void>();
  private readonly onSpellsUpdated = new LiteEvent<void>();

  private account: Account;

  constructor(account: Account) {
    this.account = account;

    this.stats = new CharacterStats();
    this.spells = new Array<SpellEntry>();
    this.mount = new Mount(account);
    this.jobs = new Jobs(account);
    this.inventory = new Inventory(account);
  }

  get freeSoul() {
    if (this.lifeStatus !== PlayerLifeStatusEnum.STATUS_TOMBSTONE) {
      return false;
    }

    return true;
  }

  public sit() {
    if (this.account.isBusy) {
      return;
    }

    this.account.network.sendMessageFree("EmotePlayRequestMessage", { emoteId: 1 });
  }

  public getSpell(id: number): SpellEntry {
    const s = this.spells.find((f) => f.id === id);
    if (s !== undefined) {
      return s;
    } else {
      return null;
    }
  }

  public getSpellByName(name: string): SpellEntry {
    const s = this.spells.find((f) => f.name === name);
    if (s !== undefined) {
      return s;
    } else {
      return null;
    }
  }

  public canBoostStat(stat: BoostableStats): boolean {
    return this.stats.statsPoints > this.getNeededPointsToBoostStat(stat);
  }

  public boostStat(stat: BoostableStats, pts = 1): boolean {
    const neededPts = this.getNeededPointsToBoostStat(stat);

    if (this.stats.statsPoints < neededPts) {
      return false;
    }

    const possiblePts = this.stats.statsPoints / neededPts;

    pts = (pts === 0 ? possiblePts : pts > possiblePts ? possiblePts : pts) * neededPts;

    this.account.network.sendMessageFree("StatsUpgradeRequestMessage", {
      boostPoint: pts,
      statId: stat,
    });

    this.account.logger.logDebug("", `Vous avez augmenté ${pts} points en ${BoostableStats[stat]}`);
    return true;
  }

  public autoBoostStat(stat: BoostableStats): boolean {
    if (this.stats.statsPoints === 0) {
      return false;
    }

    let data: number[][] = null;
    let baseStats = 0;
    let statsPointsLeft = this.stats.statsPoints;
    let pts = 0;

    switch (stat) {
      case BoostableStats.AGILITY:
        data = this.breedData.statsPointsForAgility;
        baseStats = this.stats.agility.base;
        break;
      case BoostableStats.CHANCE:
        data = this.breedData.statsPointsForChance;
        baseStats = this.stats.chance.base;
        break;
      case BoostableStats.INTELLIGENCE:
        data = this.breedData.statsPointsForIntelligence;
        baseStats = this.stats.intelligence.base;
        break;
      case BoostableStats.STRENGTH:
        data = this.breedData.statsPointsForStrength;
        baseStats = this.stats.strength.base;
        break;
      case BoostableStats.VITALITY:
        data = this.breedData.statsPointsForVitality;
        baseStats = this.stats.vitality.base;
        break;
      case BoostableStats.WISDOM:
        data = this.breedData.statsPointsForWisdom;
        baseStats = this.stats.wisdom.base;
        break;
    }

    while (statsPointsLeft > 0) {
      const neededPts = data.find((d) => baseStats >= d[0])[1]; // TODO: Replace by findLast

      if (statsPointsLeft < neededPts) {
        break;
      }

      statsPointsLeft -= neededPts;
      pts += neededPts;
      baseStats++;
    }

    if (pts === 0) {
      return false;
    }

    this.account.network.sendMessageFree("StatsUpgradeRequestMessage", {
      boostPoint: pts,
      statId: stat,
    });

    this.account.logger.logDebug("", `Vous avez augmenté ${pts} points en ${BoostableStats[stat]}`);
    return true;
  }

  public levelUpSpell(spell: SpellEntry): boolean {
    if (spell.id === 0 || spell.level === 6) {
      return false;
    }

    if (this.stats.spellsPoints < spell.level) {
      return false;
    }

    if (spell.level === 5 && this.level < spell.minPlayerLevel + 100) {
      return false;
    }

    this.account.network.sendMessageFree("SpellUpgradeMessage", {
      spellId: spell.id,
      spellLevel: spell.level + 1,
    });

    this.account.logger.logDebug("", `Vous avez augmenté ${spell.name} au level ${spell.level + 1}`);
    return true;
  }

  public autoLevelUpSpell(spellId: number, maxLevel = 6): boolean {
    // In case its the basic attack or we don't have any spell points
    if (spellId === 0 || this.stats.spellsPoints === 0) {
      return false;
    }

    const spell = this.getSpell(spellId);

    // In case the character doesn't have the spell or the spell is already maxed out
    if (spell === null || spell.level === 6) {
      return false;
    }

    // If the character can't reach the max level
    if (maxLevel === 6 && this.level < spell.minPlayerLevel + 100) {
      maxLevel--;
    }

    // If we already reached the max level
    if (spell.level >= maxLevel) {
      return false;
    }

    let spellsPtsLeft = this.stats.spellsPoints;
    let spellLevel = spell.level;
    let level = 0;

    while (spellsPtsLeft > 0 && spellLevel < maxLevel && spellLevel < 6) {
      if (spellsPtsLeft < spellLevel) {
        break;
      }
      spellsPtsLeft -= spellLevel;
      spellLevel++;
      level = spellLevel;
    }

    if (level === 0) {
      return false;
    }

    this.account.network.sendMessageFree("SpellUpgradeMessage", {
      spellId,
      spellLevel: level,
    });

    this.account.logger.logDebug("", `Vous avez augmenté ${spell.name} au level ${level}`);
    return true;
  }

  public changeStatus(status: PlayerStatusEnum) {
    if (this.status === status) {
      return;
    }

    this.account.network.sendMessageFree("PlayerStatusUpdateRequestMessage", {
      status: {
        statusId: status,
      },
    });
  }

  // TODO: skinurl
  public getSkinUrl(mode: string, orientation: number, width: number, height: number, zoom: number): string {
    // let text = "http://staticns.ankama.com/dofus/renderer/look/7";
    let text = "https://s.ankama.com/www/static.ankama.com/dofus/renderer/look/7";
    text += "b3";
    let num = 0;
    const array = `${this.look.bonesId}`.split("");
    const array2 = array;
    for (const c of array2) {
      const num2 = num;
      num = num2 + 1;
      text += `${c}`;
      const flag = num >= array.length;
      if (flag) {
        text += "7";
      } else {
        text += "3";
      }
    }
    let num3 = 0;
    let num4 = 0;
    for (const current of this.look.skins) {
      let num2 = num3;
      num3 = num2 + 1;
      text += "c3";
      const array3 = `${current}`.split("");
      const array4 = array3;
      for (const c2 of array4) {
        num2 = num4;
        num4 = num2 + 1;
        text += `${c2}`;
        const flag2 = num4 >= array3.length && num3 < this.look.skins.length;
        if (flag2) {
          text += "2";
          num4 = 0;
        } else {
          const flag3 = num4 < array3.length && num3 <= this.look.skins.length;
          if (flag3) {
            text += "3";
          }
        }
      }
      const flag4 = num3 >= this.look.skins.length;
      if (flag4) {
        text += "7";
      }
    }
    let num5 = 0;
    for (const current2 of this.look.indexedColors) {
      let num2 = num5;
      num5 = num2 + 1;
      text = text.concat("c3", `${num5}`, "3d3");
      num4 = 0;
      const array5 = `${current2}`.split("");
      const array6 = array5;
      for (const c3 of array6) {
        num2 = num4;
        num4 = num2 + 1;
        text += `${c3}`;
        const flag5 = num4 >= array5.length && num5 < this.look.indexedColors.length;
        if (flag5) {
          text += "2";
          num4 = 0;
        } else {
          const flag6 = num4 < array5.length && num5 <= this.look.indexedColors.length;
          if (flag6) {
            text += "3";
          }
        }
      }
      const flag7 = num5 >= this.look.indexedColors.length;
      if (flag7) {
        text += "7";
      }
    }
    let num6 = 0;
    for (const current3 of this.look.scales) {
      let num2 = num6;
      num6 = num2 + 1;
      text += "c3";
      num4 = 0;
      const array7 = `${current3}`.split("");
      const array8 = array7;
      for (const c4 of array8) {
        num2 = num4;
        num4 = num2 + 1;
        text += `${c4}`;
        const flag8 = num4 >= array7.length && num6 < this.look.scales.length;
        if (flag8) {
          text += "2";
          num4 = 0;
        } else {
          const flag9 = num4 < array7.length && num6 <= this.look.scales.length;
          if (flag9) {
            text += "3";
          }
        }
      }
      const flag10 = num6 >= this.look.scales.length;
      if (flag10) {
        text += "7";
      }
    }
    text = text.concat("d/", mode, "/", `${orientation}`, "/", `${width}`, "_", `${height}`, "-", `${zoom}`, ".png");
    return text;
  }

  public clear() {
    this.isSelected = false;
    this.mount.clear();
  }

  public async UpdateCharacterSelectedSuccessMessage(message: any) {
    this.id = message.infos.id;
    this.name = message.infos.name;
    this.level = message.infos.level;
    this.breed = message.infos.breed;
    this.sex = message.infos.sex;
    this.look = message.infos.entityLook;
    this.skinUrl = this.getSkinUrl("full", 1, 128, 256, 0);
    const breedResponse = await DataManager.get(Breeds, message.infos.breed);
    this.breedData = breedResponse[0].object;
    this.status = PlayerStatusEnum.AVAILABLE;
    this.lifeStatus = PlayerLifeStatusEnum.STATUS_ALIVE_AND_KICKING;

    this.account.config.setConfigFilePath();
    this.account.config.load();
    this.account.extensions.fights.config.setConfigFilePath();
    this.account.extensions.fights.config.load();
    this.account.extensions.bid.config.setConfigFilePath();
    this.account.extensions.bid.config.load();
    this.account.extensions.flood.config.setConfigFilePath();
    this.account.extensions.flood.config.load();

    this.isSelected = true;
    this.onCharacterSelected.trigger();
  }

  public async UpdateCharacterStatsListMessage(message: any) {
    this.stats.UpdateCharacterStatsListMessage(message);
    this.inventory.UpdateCharacterStatsListMessage(message);
    this.onStatsUpdated.trigger();
  }

  public async UpdateCharacterLevelUpMessage(message: any) {
    this.level = message.newLevel;
    this.onStatsUpdated.trigger();
  }

  public async UpdateGameRolePlayPlayerLifeStatusMessage(message: any) {
    this.lifeStatus = message.state;
  }

  public async UpdatePlayerStatusUpdateMessage(message: any) {
    this.status = message.status.statusId;
  }

  public async UpdateSpellListMessage(message: any) {
    this.spells = new Array<SpellEntry>();

    const ids = message.spells.map((s: any) => s.spellId);
    const spells = await DataManager.get(Spells, ...ids);

    for (const sp of message.spells) {
      const spell = spells.find((f) => f.id === sp.spellId);
      this.spells.push(new SpellEntry(sp, spell.object));
    }
    this.onSpellsUpdated.trigger();
  }

  public async UpdateSpellUpgradeSuccessMessage(message: any) {
    const spell = this.getSpell(message.spellId);
    if (spell !== null) {
      spell.UpdateSpellUpgradeSuccessMessage(message);
    } else {
      this.spells.push(new SpellEntry(message.spellId, message.spellLevel));
      // TODO: Check if the new added spellEntry contains good data.
      console.log("SpellEntryAddedOnUpgrade => ", this.spells);
    }
    this.onSpellsUpdated.trigger();
  }

  public async UpdateEmotePlayMessage(message: any) {
    if (message.actorId !== this.id) {
      return;
    }

    if (message.emoteId === 1 && this.account.state !== AccountStates.REGENERATING) {
      this.account.state = AccountStates.REGENERATING;
    } else if (message.emoteId === 0 && this.account.state === AccountStates.REGENERATING) {
      this.account.state = AccountStates.NONE;
    }
  }

  public UpdateLifePointsRegenBeginMessage(message: any) {
    this.regenTimer = global.setInterval(this.regenTimerCallBack.bind(this), message.regenRate * 100);
  }

  public UpdateLifePointsRegenEndMessage(message: any) {
    global.clearInterval(this.regenTimer);
  }

  private regenTimerCallBack() {
    if (this.stats.lifePoints >= this.stats.maxLifePoints) {
      global.clearInterval(this.regenTimer);
      return;
    }
    this.stats.lifePoints++;
  }

  private getNeededPointsToBoostStat(stat: BoostableStats): number {
    let data: number[][] = null;
    let baseStats = 0;

    switch (stat) {
      case BoostableStats.AGILITY:
        data = this.breedData.statsPointsForAgility;
        baseStats = this.stats.agility.base;
        break;
      case BoostableStats.CHANCE:
        data = this.breedData.statsPointsForChance;
        baseStats = this.stats.chance.base;
        break;
      case BoostableStats.INTELLIGENCE:
        data = this.breedData.statsPointsForIntelligence;
        baseStats = this.stats.intelligence.base;
        break;
      case BoostableStats.STRENGTH:
        data = this.breedData.statsPointsForStrength;
        baseStats = this.stats.strength.base;
        break;
      case BoostableStats.VITALITY:
        data = this.breedData.statsPointsForVitality;
        baseStats = this.stats.vitality.base;
        break;
      case BoostableStats.WISDOM:
        data = this.breedData.statsPointsForWisdom;
        baseStats = this.stats.wisdom.base;
        break;
    }

    return data.find((d) => baseStats >= d[0])[1]; // TODO: Replace by findLast
  }
}
