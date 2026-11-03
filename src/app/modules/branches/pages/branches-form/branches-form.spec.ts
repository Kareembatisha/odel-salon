import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BranchesForm } from './branches-form';

describe('BranchesForm', () => {
  let component: BranchesForm;
  let fixture: ComponentFixture<BranchesForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchesForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BranchesForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
