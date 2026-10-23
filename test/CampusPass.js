
import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("CampusPass", function () {
  async function deployCampusPass() {
    const [organizer, participant, anotherUser] =
      await ethers.getSigners();

    const campusPass = await ethers.deployContract("CampusPass");
    await campusPass.waitForDeployment();

    return {
      campusPass,
      organizer,
      participant,
      anotherUser,
    };
  }

  it("etkinlik oluşturabilmeli", async function () {
    const { campusPass, organizer } = await deployCampusPass();

    await campusPass.createEvent("C Programlama Eğitimi", 50);

    const event = await campusPass.events(1);

    expect(event.organizer).to.equal(organizer.address);
    expect(event.title).to.equal("C Programlama Eğitimi");
    expect(event.capacity).to.equal(50n);
    expect(event.active).to.equal(true);
  });

  it("katılımcı etkinliğe kaydolabilmeli", async function () {
    const { campusPass, participant } = await deployCampusPass();

    await campusPass.createEvent("C Programlama Eğitimi", 50);
    await campusPass.connect(participant).registerForEvent(1);

    expect(await campusPass.registered(1, participant.address))
      .to.equal(true);

    const event = await campusPass.events(1);
    expect(event.registeredCount).to.equal(1n);
  });

  it("aynı katılımcı iki kez kaydolamamalı", async function () {
    const { campusPass, participant } = await deployCampusPass();

    await campusPass.createEvent("C Programlama Eğitimi", 50);
    await campusPass.connect(participant).registerForEvent(1);

    await expect(
      campusPass.connect(participant).registerForEvent(1)
    ).to.be.revertedWith("Already registered");
  });

  it("yalnızca etkinlik düzenleyicisi katılımı işaretleyebilmeli", async function () {
    const { campusPass, participant, anotherUser } =
      await deployCampusPass();

    await campusPass.createEvent("C Programlama Eğitimi", 50);
    await campusPass.connect(participant).registerForEvent(1);

    await expect(
      campusPass.connect(anotherUser).markAttendance(
        1,
        participant.address
      )
    ).to.be.revertedWith("Not organizer");
  });

  it("düzenleyici kayıtlı katılımcının katılımını işaretleyebilmeli", async function () {
    const { campusPass, participant } =
      await deployCampusPass();

    await campusPass.createEvent("C Programlama Eğitimi", 50);
    await campusPass.connect(participant).registerForEvent(1);

    await campusPass.markAttendance(1, participant.address);

    expect(await campusPass.attended(1, participant.address))
      .to.equal(true);
  });

  it("boş başlık ve sıfır kapasiteyi reddetmeli", async function () {
    const { campusPass } = await networkHelpers.loadFixture(deployCampusPass);

    await expect(campusPass.createEvent("", 50)).to.be.revertedWith("Title required");
    await expect(campusPass.createEvent("Eğitim", 0)).to.be.revertedWith("Capacity must be positive");
    expect(await campusPass.nextEventId()).to.equal(1n);
  });

  it("etkinlik kimliklerini artırmalı ve oluşturma olayını yayınlamalı", async function () {
    const { campusPass, organizer, anotherUser } = await networkHelpers.loadFixture(deployCampusPass);

    expect(await campusPass.createEvent.staticCall("İlk etkinlik", 2)).to.equal(1n);
    await expect(campusPass.createEvent("İlk etkinlik", 2))
      .to.emit(campusPass, "EventCreated").withArgs(1n, organizer.address, "İlk etkinlik", 2n);
    await expect(campusPass.connect(anotherUser).createEvent("İkinci etkinlik", 3))
      .to.emit(campusPass, "EventCreated").withArgs(2n, anotherUser.address, "İkinci etkinlik", 3n);

    expect(await campusPass.nextEventId()).to.equal(3n);
    const event = await campusPass.events(2);
    expect(event.id).to.equal(2n);
    expect(event.organizer).to.equal(anotherUser.address);
    expect(event.registeredCount).to.equal(0n);
  });

  it("olmayan etkinliğe kayıt ve katılım işlemlerini reddetmeli", async function () {
    const { campusPass, participant } = await networkHelpers.loadFixture(deployCampusPass);

    for (const eventId of [0, 1]) {
      await expect(campusPass.connect(participant).registerForEvent(eventId))
        .to.be.revertedWith("Event does not exist");
      await expect(campusPass.markAttendance(eventId, participant.address))
        .to.be.revertedWith("Event does not exist");
    }
  });

  it("kapasite dolduğunda yeni kaydı reddetmeli ve kayıt sayısını korumalı", async function () {
    const { campusPass, participant, anotherUser } = await networkHelpers.loadFixture(deployCampusPass);

    await campusPass.createEvent("Eğitim", 1);
    await expect(campusPass.connect(participant).registerForEvent(1))
      .to.emit(campusPass, "UserRegistered").withArgs(1n, participant.address);
    await expect(campusPass.connect(anotherUser).registerForEvent(1))
      .to.be.revertedWith("Event is full");

    expect((await campusPass.events(1)).registeredCount).to.equal(1n);
    expect(await campusPass.registered(1, anotherUser.address)).to.equal(false);
  });

  it("kayıtlı olmayan katılımcının katılımını reddetmeli", async function () {
    const { campusPass, participant } = await networkHelpers.loadFixture(deployCampusPass);

    await campusPass.createEvent("Eğitim", 2);
    await expect(campusPass.markAttendance(1, participant.address))
      .to.be.revertedWith("Not registered");
    expect(await campusPass.attended(1, participant.address)).to.equal(false);
  });

  it("katılım olayını yayınlamalı ve ikinci işaretlemeyi reddetmeli", async function () {
    const { campusPass, participant } = await networkHelpers.loadFixture(deployCampusPass);

    await campusPass.createEvent("Eğitim", 2);
    await campusPass.connect(participant).registerForEvent(1);
    await expect(campusPass.markAttendance(1, participant.address))
      .to.emit(campusPass, "AttendanceMarked").withArgs(1n, participant.address);
    await expect(campusPass.markAttendance(1, participant.address))
      .to.be.revertedWith("Already attended");
    expect(await campusPass.attended(1, participant.address)).to.equal(true);
  });

  it("farklı etkinliklerin kayıt ve katılım bilgilerini ayrı tutmalı", async function () {
    const { campusPass, participant } = await networkHelpers.loadFixture(deployCampusPass);

    await campusPass.createEvent("İlk etkinlik", 1);
    await campusPass.createEvent("İkinci etkinlik", 1);
    await campusPass.connect(participant).registerForEvent(1);
    await campusPass.markAttendance(1, participant.address);

    expect(await campusPass.registered(2, participant.address)).to.equal(false);
    expect(await campusPass.attended(2, participant.address)).to.equal(false);
    expect((await campusPass.events(2)).registeredCount).to.equal(0n);
    await campusPass.connect(participant).registerForEvent(2);
    expect((await campusPass.events(1)).registeredCount).to.equal(1n);
    expect((await campusPass.events(2)).registeredCount).to.equal(1n);
  });
});
