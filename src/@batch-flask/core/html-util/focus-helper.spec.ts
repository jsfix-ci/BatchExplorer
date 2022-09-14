import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { focusWithin } from "./focus-helper";

@Component({
    template: `
<div id="container">
    <span></span>
    <input/>
    <div></div>
</div>
    `
}) class TestComponent { }

describe("focus-helper", () => {
    describe("focusWithin", () => {
        let fixture: ComponentFixture<TestComponent>;

        beforeEach(() => {
            TestBed.configureTestingModule({
                declarations: [TestComponent]
            });

            fixture = TestBed.createComponent(TestComponent);
            fixture.detectChanges();
        });
        it("focuses on the first interactive element", async () => {
            const container = fixture.debugElement.query(By.css("#container")).nativeElement;
            expect(document.activeElement).toEqual(document.body);

            const spanElement = container.childNodes[0];
            const inputElement = container.childNodes[1];

            focusWithin(container);
            expect(document.activeElement).toEqual(inputElement);

            spanElement.tabIndex = 0;

            focusWithin(container);
            expect(document.activeElement).toEqual(spanElement);
        });
    });
});
